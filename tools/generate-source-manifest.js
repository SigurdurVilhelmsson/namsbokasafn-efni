#!/usr/bin/env node
/**
 * generate-source-manifest.js — write books/<book>/01-source/.source-manifest.json,
 * the committed sha256 baseline that makes a silent 01-source swap detectable (F2).
 *
 * DELIBERATELY separate from download-source.js: generating this manifest is an
 * intentional provenance act. Never auto-run it on fetch, or a swap-then-refetch
 * would mint a manifest matching the swapped bytes and defeat the guard.
 *
 * Usage:
 *   node tools/generate-source-manifest.js --book efnafraedi-2e
 *   node tools/generate-source-manifest.js --all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  computeSourceManifest,
  listCnxmlFiles,
  MANIFEST_NAME,
} = require('./lib/source-manifest.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

const NOTE =
  'Tamper-evidence baseline for the CC BY 01-source CNXML. Regenerating this to match an ' +
  'upstream swap destroys the provenance basis — see CLAUDE.md source-overwrite rule.';

/** Compute + write the manifest for one book's 01-source dir. Returns the file count. */
export function writeManifestFor(sourceDir, book) {
  const manifest = computeSourceManifest(sourceDir, { book });
  const out = {
    version: manifest.version,
    book: manifest.book,
    algorithm: manifest.algorithm,
    generatedAt: new Date().toISOString(),
    note: NOTE,
    files: manifest.files,
  };
  fs.writeFileSync(
    path.join(sourceDir, MANIFEST_NAME),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );
  return Object.keys(manifest.files).length;
}

/** Book slugs that have a populated 01-source/ (contains at least one .cnxml, any depth). */
function populatedBooks() {
  if (!fs.existsSync(BOOKS_DIR)) return [];
  return fs
    .readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => listCnxmlFiles(path.join(BOOKS_DIR, slug, '01-source')).length > 0);
}

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const bookIdx = argv.indexOf('--book');
  const book = bookIdx !== -1 ? argv[bookIdx + 1] : null;

  if (!all && !book) {
    console.error('Usage: node tools/generate-source-manifest.js (--book SLUG | --all)');
    process.exit(1);
  }

  const books = all ? populatedBooks() : [book];
  for (const slug of books) {
    const sourceDir = path.join(BOOKS_DIR, slug, '01-source');
    const count = writeManifestFor(sourceDir, slug);
    console.log(`Wrote ${MANIFEST_NAME} for ${slug} (${count} CNXML files)`);
  }
}

if (process.argv[1] === __filename) main();
