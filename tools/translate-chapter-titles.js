#!/usr/bin/env node
/**
 * Translate chapter titles for a book via the Málstaður API.
 *
 * Reads English titles from collection-order.json, translates them,
 * and updates the server data file with Icelandic titles.
 *
 * Usage:
 *   node tools/translate-chapter-titles.js <book-slug>
 *   node tools/translate-chapter-titles.js lifraen-efnafraedi --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, formatGlossary } from './lib/malstadur-api.js';
import { loadEnvFile } from './api-translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env if API key not in environment
if (!process.env.MALSTADUR_API_KEY) {
  const envVars = loadEnvFile(path.join(ROOT, '.env'));
  if (envVars.MALSTADUR_API_KEY) {
    process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
  }
}

const slug = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!slug) {
  console.error('Usage: node tools/translate-chapter-titles.js <book-slug> [--dry-run]');
  process.exit(1);
}

// Find the collection-order.json
const collectionPath = path.join(ROOT, 'books', slug, '01-source', 'collection-order.json');
if (!fs.existsSync(collectionPath)) {
  console.error(`collection-order.json not found: ${collectionPath}`);
  process.exit(1);
}

// Find the matching data file (slug may differ from catalogue slug)
const dataDir = path.join(ROOT, 'server', 'data');
let dataPath = null;
for (const file of fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.slug === slug) {
      dataPath = path.join(dataDir, file);
      break;
    }
  } catch {
    /* skip */
  }
}

if (!dataPath) {
  console.error(`No data file found with slug '${slug}' in server/data/`);
  process.exit(1);
}

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const bookData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Collect titles to translate (skip any already translated)
const toTranslate = [];
for (const ch of collection.chapters) {
  const dataChapter = bookData.chapters.find((c) => c.chapter === ch.chapter);
  if (dataChapter && !dataChapter.titleIs) {
    toTranslate.push({ chapter: ch.chapter, titleEn: ch.title, dataChapter });
  } else if (dataChapter?.titleIs) {
    console.log(`Ch ${ch.chapter}: already translated → "${dataChapter.titleIs}"`);
  }
}

if (toTranslate.length === 0) {
  console.log('All chapter titles already have Icelandic translations.');
  process.exit(0);
}

console.log(`\n${toTranslate.length} titles to translate${dryRun ? ' (DRY RUN)' : ''}:\n`);
for (const item of toTranslate) {
  console.log(`  Ch ${item.chapter}: "${item.titleEn}"`);
}

if (dryRun) {
  const totalChars = toTranslate.reduce((sum, t) => sum + t.titleEn.length, 0);
  console.log(`\nTotal: ${totalChars} characters (~${((totalChars * 5) / 1000).toFixed(1)} ISK)`);
  process.exit(0);
}

// Translate
if (!process.env.MALSTADUR_API_KEY) {
  console.error('\nMALSTADUR_API_KEY not set. Add it to .env');
  process.exit(1);
}

const client = createClient();

// Load book glossary and build API glossary for title translation
const glossaryPath = path.join(ROOT, 'books', slug, 'glossary', 'glossary-unified.json');
let glossaries = [];
const inlineTerms = [{ english: 'stereochemistry', icelandic: 'rúmefnafræði', status: 'approved' }];
if (fs.existsSync(glossaryPath)) {
  try {
    const bookTerms = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    const allTerms = [...(Array.isArray(bookTerms) ? bookTerms : []), ...inlineTerms];
    glossaries = [formatGlossary(allTerms, { domain: 'chemistry', approvedOnly: false })];
    console.log(`\nGlossary: ${allTerms.length} terms (${glossaryPath})`);
  } catch {
    /* skip */
  }
} else {
  glossaries = [formatGlossary(inlineTerms, { domain: 'chemistry', approvedOnly: false })];
  console.log(`\nGlossary: ${inlineTerms.length} inline terms (no book glossary found)`);
}

console.log('Translating...\n');

let translated = 0;
for (const item of toTranslate) {
  try {
    const result = await client.translate(item.titleEn, { targetLanguage: 'is', glossaries });
    item.dataChapter.titleIs = result.text.trim();
    console.log(`  Ch ${item.chapter}: "${item.titleEn}" → "${item.dataChapter.titleIs}"`);
    translated++;
  } catch (err) {
    console.error(`  Ch ${item.chapter}: FAILED — ${err.message}`);
  }
}

// Save updated data file
fs.writeFileSync(dataPath, JSON.stringify(bookData, null, 2) + '\n');
console.log(`\nTranslated ${translated}/${toTranslate.length} titles.`);
console.log(`Updated: ${dataPath}`);

const stats = client.getUsage();
console.log(`API usage: ${stats.totalChars} chars, ~${stats.estimatedISK.toFixed(1)} ISK`);
