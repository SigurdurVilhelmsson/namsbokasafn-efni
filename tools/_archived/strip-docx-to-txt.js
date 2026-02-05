#!/usr/bin/env node

/**
 * strip-docx-to-txt.js
 *
 * PURPOSE:
 * Converts formatted .docx files to plain .txt files for machine translation.
 * Strips all formatting (bold, italics, etc.) while preserving:
 * - Paragraph structure
 * - Headings (as plain text with markers)
 * - Lists (converted to plain text)
 * - Table content (flattened)
 *
 * USAGE:
 *   node tools/strip-docx-to-txt.js <input.docx> [output.txt]
 *   node tools/strip-docx-to-txt.js books/efnafraedi/01-source/docx/chapter-01.docx
 *
 * If output is not specified, saves to 01-source/txt/ with same filename.
 *
 * TODO: Implementation tasks
 * - [ ] Add mammoth or docx library for parsing .docx
 * - [ ] Extract text content from document
 * - [ ] Preserve paragraph breaks
 * - [ ] Handle headings (prefix with ## or similar marker)
 * - [ ] Convert lists to plain text with markers
 * - [ ] Flatten tables to readable format
 * - [ ] Handle special characters and equations
 * - [ ] Add batch processing for entire directories
 */

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node strip-docx-to-txt.js <input.docx> [output.txt]

Strips formatting from .docx files to create plain text for machine translation.

Options:
  -h, --help    Show this help message
  --batch       Process all .docx files in a directory

Examples:
  node strip-docx-to-txt.js chapter-01.docx
  node strip-docx-to-txt.js chapter-01.docx chapter-01.txt
  node strip-docx-to-txt.js --batch books/efnafraedi/01-source/docx/
`);
  process.exit(0);
}

const inputFile = args[0];
const outputFile = args[1];

console.log(`Input: ${inputFile}`);
console.log(`Output: ${outputFile || '(auto-generated)'}`);
console.log('\n⚠️  This script is a placeholder. Implementation pending.');
console.log('Dependencies needed: mammoth or similar docx parsing library');
