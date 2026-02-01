#!/usr/bin/env node

/**
 * docx-to-md.js
 *
 * Converts .docx files to Markdown format for the Chemistry Reader publication system.
 *
 * Features:
 * - Preserves heading hierarchy, bold, italic, lists, tables
 * - Extracts images to separate folder with updated paths
 * - Marks equations as [EQUATION] placeholders for manual mhchem tagging
 * - Supports single file and batch processing modes
 *
 * Usage:
 *   node tools/docx-to-md.js <input.docx> [output.md]
 *   node tools/docx-to-md.js --batch <directory>
 *
 * Options:
 *   --images-dir <path>   Directory to extract images (default: auto-detected)
 *   --verbose             Show detailed progress
 *   --dry-run             Show what would be done without writing
 *   -h, --help            Show help
 */

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const TurndownService = require('turndown');

// ============================================================================
// Configuration
// ============================================================================

const EQUATION_PLACEHOLDER = '[EQUATION]';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    batch: false,
    batchDir: null,
    imagesDir: null,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--batch') {
      result.batch = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.batchDir = args[++i];
      }
    } else if (arg === '--images-dir') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.imagesDir = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      if (!result.input) {
        result.input = arg;
      } else if (!result.output) {
        result.output = arg;
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
docx-to-md.js - Convert DOCX files to Markdown for Chemistry Reader

Usage:
  node tools/docx-to-md.js <input.docx> [output.md]
  node tools/docx-to-md.js --batch <directory>

Arguments:
  input.docx    Path to the input DOCX file
  output.md     Path for the output Markdown file (optional, auto-generated)

Options:
  --batch <dir>       Process all .docx files in directory
  --images-dir <dir>  Directory to extract images to (default: auto-detected)
  --verbose           Show detailed progress information
  --dry-run           Show what would be done without writing files
  -h, --help          Show this help message

Output Path Logic:
  If output is not specified, the script will:
  - For files in 03-faithful/ or 04-localized/:
    Output to 05-publication/chapters/ with appropriate naming
  - For other files:
    Output in same directory with .md extension

Examples:
  # Single file conversion
  node tools/docx-to-md.js books/efnafraedi/04-localized/docx/ch01/1.1-localized.docx

  # With explicit output path
  node tools/docx-to-md.js input.docx output.md

  # Batch mode - convert all .docx in directory
  node tools/docx-to-md.js --batch books/efnafraedi/04-localized/docx/ch01/

  # Verbose with custom images directory
  node tools/docx-to-md.js input.docx --images-dir ./images --verbose

Notes:
  - Equations are converted to [EQUATION] placeholders for manual mhchem tagging
  - Images are extracted and paths updated in the markdown
  - This tool produces raw markdown; use add-frontmatter.js to add metadata
`);
}

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Determine output path based on input path and project structure
 */
function resolveOutputPath(inputPath, explicitOutput) {
  if (explicitOutput) {
    return path.resolve(explicitOutput);
  }

  const absInput = path.resolve(inputPath);
  const basename = path.basename(absInput, '.docx');

  // Check if this is in the standard book structure
  const match = absInput.match(/books\/([^/]+)\/(03-faithful|04-localized)\/docx\/(ch\d+)\//);

  if (match) {
    const [, book, , chapter] = match;
    // Extract section number from filename (e.g., "1.1-localized" -> "sec01")
    const sectionMatch = basename.match(/^(\d+)\.(\d+)/);
    let outputName;
    if (sectionMatch) {
      const secNum = sectionMatch[2].padStart(2, '0');
      outputName = `${chapter}-sec${secNum}.md`;
    } else {
      outputName = `${chapter}-${basename}.md`;
    }

    // Find project root (parent of books/)
    const booksIndex = absInput.indexOf('/books/');
    const projectRoot = absInput.substring(0, booksIndex);

    return path.join(projectRoot, 'books', book, '05-publication', 'chapters', outputName);
  }

  // Default: same directory with .md extension
  return absInput.replace(/\.docx$/i, '.md');
}

/**
 * Determine images output directory
 */
function resolveImagesDir(inputPath, explicitImagesDir, outputPath) {
  if (explicitImagesDir) {
    return path.resolve(explicitImagesDir);
  }

  const absInput = path.resolve(inputPath);

  // Check if this is in the standard book structure
  const match = absInput.match(/books\/([^/]+)\/(03-faithful|04-localized)\/docx\/(ch\d+)\//);

  if (match) {
    const [, book, , chapter] = match;
    const booksIndex = absInput.indexOf('/books/');
    const projectRoot = absInput.substring(0, booksIndex);

    return path.join(projectRoot, 'books', book, '05-publication', 'images', chapter);
  }

  // Default: images folder next to output
  return path.join(path.dirname(outputPath), 'images');
}

// ============================================================================
// Turndown Configuration
// ============================================================================

function createTurndownService() {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  // Custom rule for tables
  turndown.addRule('table', {
    filter: 'table',
    replacement: function (content, node) {
      return convertTableToMarkdown(node);
    },
  });

  // Keep certain HTML tags as-is (for later processing)
  turndown.keep(['sub', 'sup']);

  return turndown;
}

/**
 * Convert HTML table to Markdown table
 */
function convertTableToMarkdown(tableNode) {
  // Handle case where tableNode might not have querySelectorAll (turndown compatibility)
  if (!tableNode || typeof tableNode.querySelectorAll !== 'function') {
    // Fallback: just return the text content in a simple format
    const text = tableNode?.textContent?.trim() || '';
    if (!text) return '';
    return '\n\n' + text + '\n\n';
  }

  const rows = Array.from(tableNode.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const markdownRows = [];
  let headerProcessed = false;

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    const cellContents = [];

    for (const cell of cells) {
      // Get text content, normalize whitespace
      let text = (cell.textContent || '').trim().replace(/\s+/g, ' ');
      // Escape pipe characters
      text = text.replace(/\|/g, '\\|');
      cellContents.push(text);
    }

    if (cellContents.length > 0) {
      markdownRows.push('| ' + cellContents.join(' | ') + ' |');

      // Add header separator after first row
      if (!headerProcessed) {
        const separator = '| ' + cellContents.map(() => '---').join(' | ') + ' |';
        markdownRows.push(separator);
        headerProcessed = true;
      }
    }
  }

  return '\n\n' + markdownRows.join('\n') + '\n\n';
}

// ============================================================================
// Image Extraction
// ============================================================================

class ImageHandler {
  constructor(imagesDir, dryRun, verbose, prefix = '') {
    this.imagesDir = imagesDir;
    this.dryRun = dryRun;
    this.verbose = verbose;
    this.imageCount = 0;
    this.images = new Map(); // contentType -> buffer mapping
    this.prefix = prefix; // Section prefix to prevent collisions in batch mode
  }

  /**
   * Create mammoth image handler that extracts images
   * Returns the converter function directly for use in mammoth options
   */
  createMammothImageConverter() {
    const self = this;

    return mammoth.images.imgElement(function (image) {
      return image.read().then(function (imageBuffer) {
        self.imageCount++;

        // Try contentType first, fall back to magic byte detection
        // (needed for Matecat .so files which have application/octet-stream)
        let ext = self.getExtensionForContentType(image.contentType);
        if (image.contentType === 'application/octet-stream' || !image.contentType) {
          const detectedExt = self.getExtensionFromMagicBytes(imageBuffer);
          if (detectedExt) {
            ext = detectedExt;
          }
        }

        const imageNum = self.imageCount.toString().padStart(3, '0');
        const filename = self.prefix
          ? `${self.prefix}-image-${imageNum}${ext}`
          : `image-${imageNum}${ext}`;
        const imagePath = path.join(self.imagesDir, filename);

        // Store image for later writing
        self.images.set(imagePath, imageBuffer);

        if (self.verbose) {
          console.log(`  Found image: ${filename} (${image.contentType} -> ${ext})`);
        }

        // Return relative path for markdown
        const relativePath = `./${path.basename(self.imagesDir)}/${filename}`;
        return { src: relativePath };
      });
    });
  }

  getExtensionForContentType(contentType) {
    const extensions = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/tiff': '.tiff',
      'image/bmp': '.bmp',
    };
    return extensions[contentType] || '.png';
  }

  /**
   * Detect image format from file magic bytes
   * Used when contentType is unreliable (e.g., Matecat .so files)
   */
  getExtensionFromMagicBytes(buffer) {
    if (buffer.length < 8) return null;

    // JPEG: starts with FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return '.jpg';
    }
    // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return '.png';
    }
    // GIF: starts with GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return '.gif';
    }
    // WebP: starts with RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return '.webp';
    }
    // BMP: starts with BM
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return '.bmp';
    }

    return null;
  }

  /**
   * Write all extracted images to disk
   */
  writeImages() {
    if (this.images.size === 0) return;

    if (!this.dryRun) {
      // Ensure images directory exists
      fs.mkdirSync(this.imagesDir, { recursive: true });

      // Write each image
      for (const [imagePath, buffer] of this.images) {
        fs.writeFileSync(imagePath, buffer);
        if (this.verbose) {
          console.log(`  Wrote: ${imagePath}`);
        }
      }
    } else {
      console.log(`[DRY RUN] Would create directory: ${this.imagesDir}`);
      for (const imagePath of this.images.keys()) {
        console.log(`[DRY RUN] Would write: ${imagePath}`);
      }
    }
  }
}

// ============================================================================
// Conversion Logic
// ============================================================================

async function convertDocxToMarkdown(inputPath, outputPath, imagesDir, options) {
  const { verbose, dryRun } = options;

  if (verbose) {
    console.log(`\nConverting: ${inputPath}`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Images: ${imagesDir}`);
  }

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Extract section prefix from filename for unique image naming
  // E.g., "1.1-localized.docx" -> "1-1", "chapter-1.docx" -> "chapter-1"
  const basename = path.basename(inputPath, '.docx');
  const sectionMatch = basename.match(/^(\d+)\.(\d+)/);
  const imagePrefix = sectionMatch
    ? `${sectionMatch[1]}-${sectionMatch[2]}`
    : basename.replace(/[^a-zA-Z0-9-]/g, '-');

  // Set up image handler with prefix to avoid collisions in batch mode
  const imageHandler = new ImageHandler(imagesDir, dryRun, verbose, imagePrefix);

  // Configure mammoth options
  const mammothOptions = {
    convertImage: imageHandler.createMammothImageConverter(),
    styleMap: [
      // Map Word heading styles to HTML headings
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      // Map common OpenStax styles
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
    ],
  };

  // Convert DOCX to HTML
  const result = await mammoth.convertToHtml({ path: inputPath }, mammothOptions);

  if (verbose && result.messages.length > 0) {
    console.log('  Mammoth messages:');
    result.messages.forEach((msg) => console.log(`    ${msg.type}: ${msg.message}`));
  }

  let html = result.value;

  // Mark equations as placeholders (they often appear as images or specific elements)
  // This is a basic approach - equations in Word are complex
  html = html.replace(
    /<span[^>]*class="[^"]*equation[^"]*"[^>]*>.*?<\/span>/gi,
    EQUATION_PLACEHOLDER
  );
  html = html.replace(/<math[^>]*>.*?<\/math>/gi, EQUATION_PLACEHOLDER);
  html = html.replace(/<omml[^>]*>.*?<\/omml>/gi, EQUATION_PLACEHOLDER);

  // Convert HTML to Markdown
  const turndown = createTurndownService();
  let markdown = turndown.turndown(html);

  // Post-processing cleanup
  markdown = postProcessMarkdown(markdown);

  // Write output
  if (!dryRun) {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write markdown
    fs.writeFileSync(outputPath, markdown);
    console.log(`Wrote: ${outputPath}`);

    // Write images
    imageHandler.writeImages();

    if (imageHandler.imageCount > 0) {
      console.log(`Extracted ${imageHandler.imageCount} image(s) to ${imagesDir}`);
    }
  } else {
    console.log(`[DRY RUN] Would write: ${outputPath}`);
    if (imageHandler.imageCount > 0) {
      console.log(`[DRY RUN] Would extract ${imageHandler.imageCount} image(s)`);
    }
  }

  return {
    outputPath,
    imageCount: imageHandler.imageCount,
    warnings: result.messages.filter((m) => m.type === 'warning'),
  };
}

/**
 * Clean up markdown output
 */
function postProcessMarkdown(markdown) {
  let result = markdown;

  // Fix Pandoc-style figure tables: remove horizontal rule wrappers around images
  // Pattern: ---...--- followed by image followed by ---...---
  result = result.replace(/-{50,}\s*\n\s*(!\[[^\]]*?\]\([^)]+\))\s*\n\s*-{50,}/gs, '\n$1\n');

  // Normalize multiline image alt text to single line
  // Match ![...](path) where alt text may contain newlines
  result = result.replace(/!\[([^\]]*?)\]\((\.[^)]+)\)/gs, (match, altText, imgPath) => {
    // Join multiline alt text into single line, normalize whitespace
    const cleanAlt = altText.replace(/\s+/g, ' ').trim();
    return `![${cleanAlt}](${imgPath})`;
  });

  // Wrap images with their Icelandic captions into HTML figure elements
  result = wrapFiguresWithCaptions(result);

  // Remove excessive blank lines (more than 2 consecutive)
  result = result.replace(/\n{4,}/g, '\n\n\n');

  // Clean up spacing around headings
  result = result.replace(/\n{3,}(#{1,6} )/g, '\n\n$1');

  // Ensure single blank line after headings
  result = result.replace(/(#{1,6} .+)\n{3,}/g, '$1\n\n');

  // Clean up list formatting
  result = result.replace(/\n{3,}(-|\d+\.)/g, '\n\n$1');

  // Remove trailing whitespace from lines
  result = result.replace(/[ \t]+$/gm, '');

  // Ensure file ends with single newline
  result = result.trim() + '\n';

  return result;
}

/**
 * Wrap images with their Icelandic captions into HTML figure elements
 * Converts:
 *   ![alt text](./images/image.jpg)
 *
 *   Mynd 1.28 Caption text here.
 *
 * Into:
 *   <figure>
 *   <img src="./images/image.jpg" alt="alt text">
 *   <figcaption>Mynd 1.28 Caption text here.</figcaption>
 *   </figure>
 */
function wrapFiguresWithCaptions(markdown) {
  // Pattern to match: image on its own line, followed by blank line(s),
  // followed by a paragraph starting with "Mynd X.Y" (Icelandic figure caption)
  // Caption continues until we hit a blank line, heading, another image, etc.
  const figurePattern =
    /!\[([^\]]*)\]\(([^)]+)\)\s*\n\s*\n(Mynd\s+\d+\.\d+[^\n]+(?:\n(?!(?:\n|#|!\[|<|:::|-{3,}|\||>|\d+\.|-))[^\n]+)*)/g;

  return markdown.replace(figurePattern, (match, altText, src, caption) => {
    // Clean up alt text and caption
    const cleanAlt = altText.trim().replace(/"/g, '&quot;');
    const cleanCaption = caption.trim();

    return `<figure>
<img src="${src}" alt="${cleanAlt}">
<figcaption>${cleanCaption}</figcaption>
</figure>`;
  });
}

// ============================================================================
// Batch Processing
// ============================================================================

async function processBatch(directory, options) {
  const { dryRun } = options;

  const absDir = path.resolve(directory);

  if (!fs.existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

  // Find all .docx files
  const files = findDocxFiles(absDir);

  if (files.length === 0) {
    console.log(`No .docx files found in ${absDir}`);
    return;
  }

  console.log(`Found ${files.length} .docx file(s) in ${absDir}`);
  if (dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  const results = {
    success: 0,
    failed: 0,
    totalImages: 0,
    errors: [],
  };

  for (const file of files) {
    try {
      const outputPath = resolveOutputPath(file, null);
      const imagesDir = resolveImagesDir(file, options.imagesDir, outputPath);

      const result = await convertDocxToMarkdown(file, outputPath, imagesDir, options);
      results.success++;
      results.totalImages += result.imageCount;
    } catch (err) {
      results.failed++;
      results.errors.push({ file, error: err.message });
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Batch Processing Complete');
  console.log(`  Successful: ${results.success}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total images extracted: ${results.totalImages}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(({ file, error }) => {
      console.log(`  ${path.basename(file)}: ${error}`);
    });
  }
}

/**
 * Recursively find all .docx files in directory
 */
function findDocxFiles(dir) {
  const files = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findDocxFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.docx')) {
      // Skip temporary Word files
      if (!entry.name.startsWith('~$')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.input && !args.batch)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    if (args.batch) {
      const batchDir = args.batchDir || args.input;
      if (!batchDir) {
        console.error('Error: --batch requires a directory path');
        process.exit(1);
      }
      await processBatch(batchDir, args);
    } else {
      const outputPath = resolveOutputPath(args.input, args.output);
      const imagesDir = resolveImagesDir(args.input, args.imagesDir, outputPath);

      await convertDocxToMarkdown(args.input, outputPath, imagesDir, args);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
