#!/usr/bin/env node
/**
 * verify-source-manifest.js — recompute 01-source CNXML sha256 and compare to the
 * committed .source-manifest.json. Exit nonzero + loud report on any drift or a
 * missing manifest (F2). This is the human-facing companion to the Vitest gate.
 *
 * Usage:
 *   node tools/verify-source-manifest.js --book efnafraedi-2e
 *   node tools/verify-source-manifest.js --all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySourceManifest, listCnxmlFiles } = require('./lib/source-manifest.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

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
    console.error('Usage: node tools/verify-source-manifest.js (--book SLUG | --all)');
    process.exit(1);
  }

  const books = all ? populatedBooks() : [book];
  let failed = false;
  for (const slug of books) {
    const sourceDir = path.join(BOOKS_DIR, slug, '01-source');
    const r = verifySourceManifest(sourceDir);
    if (r.ok) {
      console.log(`OK   ${slug}`);
      continue;
    }
    failed = true;
    if (r.manifestMissing) {
      console.error(`FAIL ${slug}: no .source-manifest.json (run generate-source-manifest.js)`);
    } else {
      console.error(`FAIL ${slug}: 01-source drift vs committed manifest`);
      for (const f of r.changed) console.error(`  changed: ${f}`);
      for (const f of r.missing) console.error(`  missing: ${f}`);
      for (const f of r.added) console.error(`  added:   ${f}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === __filename) main();
