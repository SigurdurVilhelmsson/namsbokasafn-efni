#!/usr/bin/env node

/**
 * Export each book's glossary from the terminology DB to
 * books/<book>/glossary/glossary-unified.json — the file tools/api-translate.js
 * feeds to Málstaður as the MT glossary (Unit 6.1).
 *
 * The committed export had been stale since 2026-03-09 because nothing
 * regenerated it. Run from cron (the 2h git-backup already stages books/, so
 * the refreshed export reaches git for free):
 *
 *   node server/scripts/export-terminology.js              # all registered books
 *   node server/scripts/export-terminology.js --book efnafraedi-2e
 *   node server/scripts/export-terminology.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const terminologyService = require('../services/terminologyService');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

function listBooks() {
  try {
    return fs
      .readdirSync(BOOKS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function main() {
  const argv = process.argv.slice(2);
  let book = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') book = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('Usage: node server/scripts/export-terminology.js [--book <slug>] [--dry-run]');
      process.exit(0);
    }
  }

  // Only export books that already have a glossary directory (i.e. registered,
  // glossary-bearing books) unless a specific book is named.
  const books = book
    ? [book]
    : listBooks().filter((b) => fs.existsSync(path.join(BOOKS_DIR, b, 'glossary')));

  for (const b of books) {
    const data = terminologyService.exportBookGlossary(b);
    const outDir = path.join(BOOKS_DIR, b, 'glossary');
    const outPath = path.join(outDir, 'glossary-unified.json');
    if (dryRun) {
      console.log(`[dry-run] ${b}: ${data.stats.total} terms (${data.stats.approved} approved)`);
      continue;
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(
      `${b}: wrote ${data.stats.total} terms (${data.stats.approved} approved) → ${outPath}`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { listBooks };
