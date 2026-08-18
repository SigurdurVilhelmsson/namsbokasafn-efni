#!/usr/bin/env node
/**
 * generate-source-manifest.js — write books/<book>/01-source/.source-manifest.json,
 * the committed sha256 baseline that makes a silent 01-source swap detectable (F2).
 *
 * DELIBERATELY separate from download-source.js: generating this manifest is an
 * intentional provenance act. Never auto-run it on fetch, or a swap-then-refetch
 * would mint a manifest matching the swapped bytes and defeat the guard.
 *
 * MINT-ONLY (§C93): refuses to overwrite a manifest that already exists. There is
 * no --force / --supersede / regenerate verb — if a tree has drifted, the fix is
 * `git checkout` of the source, never a fresh manifest minted to match it. Without
 * this refusal, `--all` is a one-line laundering command: it would silently make
 * `verify-source-manifest` go green over whatever bytes happen to be on disk.
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

/**
 * The book's own recorded licence code, read from the book-config.json sibling
 * of `sourceDir` (`books/<book>/book-config.json`). Throws if it can't be read —
 * a manifest with no known licence would have to guess at the note it writes,
 * and this tool fails closed instead. Mirrors the read `source-refresh-policy.cjs`
 * G1 does, independently, on purpose: this file is not fenced for this task and
 * a shared import would add a coupling neither module currently has.
 */
function readLicenceCode(sourceDir) {
  const configPath = path.join(sourceDir, '..', 'book-config.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read a licence for ${sourceDir} (${configPath}: ${err.message})`);
  }
  const lic = cfg.licence || cfg.license;
  const code = typeof lic === 'string' ? lic : lic && lic.code;
  if (typeof code !== 'string' || !code) {
    throw new Error(`${configPath} has no recorded licence code — cannot write an accurate note`);
  }
  return code;
}

/** The note text, licence-accurate — never the fixed "CC BY" this replaces. */
function noteFor(licenceCode) {
  return (
    `Tamper-evidence baseline for the ${licenceCode} 01-source CNXML. Regenerating this to ` +
    `match an upstream swap destroys the provenance basis — see CLAUDE.md source-overwrite rule.`
  );
}

/**
 * Compute + write the manifest for one book's 01-source dir. Returns the file count.
 * MINT-ONLY: throws if a manifest is already present at `sourceDir` — see the
 * module doc comment. Callers that want to skip rather than error (the `--all`
 * batch path) must check existence themselves before calling this.
 */
export function writeManifestFor(sourceDir, book) {
  const manifestPath = path.join(sourceDir, MANIFEST_NAME);
  if (fs.existsSync(manifestPath)) {
    throw new Error(
      `${MANIFEST_NAME} already exists for ${book} at ${manifestPath} — this tool is ` +
        `mint-only and refuses to overwrite it. If the source tree has drifted, restore it ` +
        `with 'git checkout' rather than regenerating the manifest to match. There is no ` +
        `--force / --supersede flag.`
    );
  }
  const licenceCode = readLicenceCode(sourceDir);
  const manifest = computeSourceManifest(sourceDir, { book });
  const out = {
    version: manifest.version,
    book: manifest.book,
    algorithm: manifest.algorithm,
    generatedAt: new Date().toISOString(),
    note: noteFor(licenceCode),
    files: manifest.files,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
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

  if (!all) {
    const sourceDir = path.join(BOOKS_DIR, book, '01-source');
    try {
      const count = writeManifestFor(sourceDir, book);
      console.log(`Wrote ${MANIFEST_NAME} for ${book} (${count} CNXML files)`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  // --all is mint-only: it mints only for books that lack a manifest, and
  // SKIPS (never refuses) the ones that already have one — a no-op whenever
  // every populated book already has one, which is today's tree (5 of 5).
  // No regenerate/--supersede verb exists here or anywhere in this file.
  let minted = 0;
  for (const slug of populatedBooks()) {
    const sourceDir = path.join(BOOKS_DIR, slug, '01-source');
    if (fs.existsSync(path.join(sourceDir, MANIFEST_NAME))) {
      console.log(`${MANIFEST_NAME} already exists for ${slug} — skipping (mint-only).`);
      continue;
    }
    const count = writeManifestFor(sourceDir, slug);
    console.log(`Wrote ${MANIFEST_NAME} for ${slug} (${count} CNXML files)`);
    minted += 1;
  }
  if (minted === 0) {
    console.log('Nothing to mint — every populated book already has a manifest.');
  }
}

if (process.argv[1] === __filename) main();
