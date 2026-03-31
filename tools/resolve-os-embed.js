#!/usr/bin/env node

/**
 * resolve-os-embed.js — Fetch exercise content from OpenStax Exercises API
 *
 * Resolves <link class="os-embed" url="#exercise/{nickname}"/> references
 * by fetching content from the public OpenStax Exercises API and caching
 * the results locally.
 *
 * Usage:
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi --chapter 3
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');
const API_BASE = 'https://exercises.openstax.org/api/exercises';
const RATE_LIMIT_MS = 200; // 5 requests/sec max

// ─── CLI args ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`Usage: node tools/resolve-os-embed.js --book <slug> [--chapter <num>] [--dry-run] [--verbose]

Options:
  --book <slug>      Book slug (required)
  --chapter <num>    Limit to a single chapter (optional)
  --dry-run          Show what would be fetched without making API calls
  --verbose, -v      Print details for each cached/fetched exercise
  -h, --help         Show this help`);
  process.exit(0);
}

const bookArg = args.find((a, i) => args[i - 1] === '--book') || '';
const chapterArg = args.find((a, i) => args[i - 1] === '--chapter');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

if (!bookArg) {
  console.error('Error: --book <slug> is required');
  console.error(
    'Usage: node tools/resolve-os-embed.js --book <slug> [--chapter <num>] [--dry-run] [--verbose]'
  );
  process.exit(1);
}

// ─── Scan for os-embed references ────────────────────────────

function findOsEmbedRefs(bookSlug, chapter) {
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '01-source');

  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const refs = new Set();

  const chapterDirs = chapter
    ? [`ch${String(chapter).padStart(2, '0')}`]
    : fs.readdirSync(sourceDir).filter((d) => /^ch\d+$/.test(d) || d === 'appendices');

  for (const chDir of chapterDirs) {
    const dirPath = path.join(sourceDir, chDir);
    if (!fs.existsSync(dirPath)) {
      console.warn(`Warning: chapter directory not found: ${dirPath}`);
      continue;
    }

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.cnxml'));
    for (const file of files) {
      const cnxml = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const pattern = /url="#exercise\/([^"]+)"/g;
      let match;
      while ((match = pattern.exec(cnxml)) !== null) {
        refs.add(match[1]);
      }
    }
  }

  return [...refs].sort();
}

// ─── Fetch from API ──────────────────────────────────────────

async function fetchExercise(nickname) {
  const url = `${API_BASE}?q=nickname:${encodeURIComponent(nickname)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error ${response.status} ${response.statusText} for ${nickname}`);
  }
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Download images ─────────────────────────────────────────

async function downloadImage(imageUrl, destPath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    console.warn(
      `  Warning: failed to download image ${path.basename(destPath)}: HTTP ${response.status}`
    );
    return false;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return true;
}

// Extract image URLs from exercise data (handles various API shapes)
function extractImageUrls(exercise) {
  const urls = [];

  // Top-level images array
  if (Array.isArray(exercise.images)) {
    for (const img of exercise.images) {
      if (img.url) urls.push(img.url);
    }
  }

  // Images embedded in question stems or answer content
  const json = JSON.stringify(exercise);
  const pattern = /https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|gif|svg|webp)/gi;
  let match;
  while ((match = pattern.exec(json)) !== null) {
    urls.push(match[0]);
  }

  // Deduplicate
  return [...new Set(urls)];
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const refs = findOsEmbedRefs(bookArg, chapterArg);

  const scope = chapterArg ? `chapter ${chapterArg}` : 'whole book';
  console.log(`Found ${refs.length} unique os-embed exercise references (${scope})`);

  if (refs.length === 0) {
    console.log('No os-embed references found. Nothing to do.');
    return;
  }

  const cacheDir = path.join(BOOKS_DIR, bookArg, '01-source', 'exercises');
  const mediaDir = path.join(BOOKS_DIR, bookArg, '01-source', 'media');

  if (dryRun) {
    console.log(`\nDry run — would fetch to: ${cacheDir}`);
    const preview = refs.slice(0, 10);
    for (const ref of preview) {
      const cached = fs.existsSync(path.join(cacheDir, `${ref}.json`));
      console.log(`  ${cached ? '[cached]' : '[would fetch]'} ${ref}`);
    }
    if (refs.length > 10) console.log(`  ... and ${refs.length - 10} more`);
    return;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });

  let fetched = 0;
  let cached = 0;
  let failed = 0;
  let imagesDownloaded = 0;

  for (const nickname of refs) {
    const cachePath = path.join(cacheDir, `${nickname}.json`);

    // Skip if already cached
    if (fs.existsSync(cachePath)) {
      cached++;
      if (verbose) console.log(`  [cached] ${nickname}`);
      continue;
    }

    try {
      const data = await fetchExercise(nickname);

      if (!data.items || data.items.length === 0) {
        console.warn(`  [empty]  ${nickname} — no items returned from API`);
        failed++;
        continue;
      }

      const exercise = data.items[0];

      // Download any exercise images
      const imageUrls = extractImageUrls(exercise);
      for (const imgUrl of imageUrls) {
        try {
          const imgName = path.basename(new URL(imgUrl).pathname);
          const destPath = path.join(mediaDir, imgName);
          if (!fs.existsSync(destPath)) {
            const ok = await downloadImage(imgUrl, destPath);
            if (ok) {
              imagesDownloaded++;
              if (verbose) console.log(`    Downloaded image: ${imgName}`);
            }
          } else if (verbose) {
            console.log(`    Image already exists: ${imgName}`);
          }
        } catch (imgErr) {
          console.warn(`    Warning: could not process image URL ${imgUrl}: ${imgErr.message}`);
        }
      }

      // Cache the full API item
      fs.writeFileSync(cachePath, JSON.stringify(exercise, null, 2));
      fetched++;

      const questionCount = exercise.questions?.length ?? 0;
      console.log(
        `  [fetched] ${nickname} (${questionCount} question${questionCount !== 1 ? 's' : ''})`
      );

      // Rate limit
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  [error]  ${nickname}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\nDone: ${fetched} fetched, ${cached} cached, ${failed} failed (${refs.length} total)`
  );
  if (imagesDownloaded > 0) console.log(`Images downloaded: ${imagesDownloaded}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
