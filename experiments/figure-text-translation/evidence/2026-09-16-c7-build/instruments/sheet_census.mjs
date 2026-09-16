#!/usr/bin/env node
/**
 * §C140 ⑦ fix wave — every `*_IS.svg` under `books/<slug>/media/`, classified by the SHIPPED
 * functions in `tools/figure-run.js` (`rootViewBox`, `paperSizeName`, `loadPaperSizes`), so this
 * census measures the code the run uses rather than a second copy of it. Read-only, 0 ISK.
 *
 *   node experiments/figure-text-translation/evidence/2026-09-16-c7-build/instruments/sheet_census.mjs
 *
 * Prints the population, every paper-size sheet, and every copy whose viewBox could not be read.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPaperSizes, paperSizeName, rootViewBox } from '../../../../../tools/figure-run.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const BOOKS = path.join(REPO, 'books');
const paper = loadPaperSizes();

function head(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    return buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

const files = [];
for (const slug of fs.readdirSync(BOOKS).sort()) {
  const media = path.join(BOOKS, slug, 'media');
  if (!fs.existsSync(media) || !fs.statSync(media).isDirectory()) continue;
  for (const name of fs.readdirSync(media).sort()) {
    if (name.endsWith('_IS.svg')) files.push(path.join(media, name));
  }
}

const sheets = [];
const unreadable = [];
const perBook = {};
for (const file of files) {
  const rel = path.relative(REPO, file);
  const slug = rel.split(path.sep)[1];
  perBook[slug] = (perBook[slug] || 0) + 1;
  const box = rootViewBox(head(file));
  if (box.error) {
    unreadable.push(`${rel}  (${box.error})`);
    continue;
  }
  const name = paperSizeName([box.w, box.h], paper);
  if (name) sheets.push(`${rel}  ${box.w}×${box.h} pt (${name})`);
}

console.log(`population: ${files.length} *_IS.svg under books/*/media/`);
for (const [slug, n] of Object.entries(perBook)) console.log(`  ${slug}: ${n}`);
console.log(`paper-size sheets: ${sheets.length}`);
for (const line of sheets) console.log(`  ${line}`);
console.log(`viewBox could not be read: ${unreadable.length}`);
for (const line of unreadable) console.log(`  ${line}`);
console.log('DONE');
