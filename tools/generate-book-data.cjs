#!/usr/bin/env node

/**
 * Generate Book Data CLI
 *
 * Generates JSON data files for books by fetching structure from OpenStax
 * and merging Icelandic titles from the database.
 *
 * Usage:
 *   node tools/generate-book-data.js chemistry-2e     # Generate for specific book
 *   node tools/generate-book-data.js --all            # Generate for all available books
 *   node tools/generate-book-data.js --list           # List available books and status
 *   node tools/generate-book-data.js chemistry-2e --force  # Regenerate even if exists
 */

const path = require('path');

// Add server directory to path for requires
const serverDir = path.join(__dirname, '..', 'server');
const bookDataGenerator = require(path.join(serverDir, 'services', 'bookDataGenerator'));

function printUsage() {
  console.log(`
Usage: node tools/generate-book-data.js <book-slug> [options]

Commands:
  <book-slug>    Generate data for a specific book (e.g., chemistry-2e)
  --all          Generate data for all available books
  --list         List available books and their data file status

Options:
  --force        Regenerate even if file already exists
  --help         Show this help message

Examples:
  node tools/generate-book-data.js chemistry-2e
  node tools/generate-book-data.js chemistry-2e --force
  node tools/generate-book-data.js --all
  node tools/generate-book-data.js --list
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const force = args.includes('--force');

  // List command
  if (args.includes('--list')) {
    console.log('\nAvailable books:\n');

    const books = bookDataGenerator.listBooks();

    // Print header
    console.log(
      'Slug'.padEnd(25) +
      'Data File'.padEnd(12) +
      'Chapters'.padEnd(12) +
      'Expected'.padEnd(12) +
      'Registered'.padEnd(12) +
      'Status'
    );
    console.log('-'.repeat(85));

    for (const book of books) {
      const status = [];
      if (book.needsUpdate) status.push('NEEDS UPDATE');
      if (!book.hasDataFile) status.push('NO FILE');
      if (book.isRegistered) status.push('registered');

      console.log(
        book.slug.padEnd(25) +
        (book.hasDataFile ? 'Yes' : 'No').padEnd(12) +
        String(book.chapters || '-').padEnd(12) +
        String(book.expectedChapters || '-').padEnd(12) +
        (book.isRegistered ? 'Yes' : 'No').padEnd(12) +
        (status.join(', ') || 'OK')
      );
    }

    console.log('');
    const needsUpdate = books.filter(b => b.needsUpdate || !b.hasDataFile);
    if (needsUpdate.length > 0) {
      console.log(`${needsUpdate.length} book(s) need data file generation/update.`);
      console.log('Run with --all to generate all, or specify a book slug.\n');
    }

    return;
  }

  // Generate all command
  if (args.includes('--all')) {
    console.log('Generating data for all available books...\n');

    try {
      const result = await bookDataGenerator.generateAllBookData({ force });

      console.log('\nResults:');
      console.log(`  Total:     ${result.total}`);
      console.log(`  Generated: ${result.generated}`);
      console.log(`  Skipped:   ${result.skipped}`);
      console.log(`  Failed:    ${result.failed}`);

      if (result.failed > 0) {
        console.log('\nFailed books:');
        for (const book of result.books.filter(b => !b.success)) {
          console.log(`  ${book.book}: ${book.error}`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }

    return;
  }

  // Generate specific book
  const bookSlug = args.find(a => !a.startsWith('--'));

  if (!bookSlug) {
    console.error('Error: No book slug specified');
    printUsage();
    process.exit(1);
  }

  console.log(`Generating data for ${bookSlug}...`);

  try {
    const result = await bookDataGenerator.generateBookData(bookSlug, { force });

    if (result.skipped) {
      console.log(`\nSkipped: ${result.message}`);
    } else {
      console.log(`\nGenerated: ${result.path}`);
      console.log(`  Chapters: ${result.chapters}`);
      console.log(`  Modules:  ${result.modules}`);
      if (result.appendices > 0) {
        console.log(`  Appendices: ${result.appendices}`);
      }
      if (result.hasIcelandicTitles) {
        console.log(`  Icelandic titles merged from database`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
