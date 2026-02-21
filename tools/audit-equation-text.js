#!/usr/bin/env node

/**
 * audit-equation-text.js
 *
 * Scan equation structure files and report untranslated English text
 * inside equations. Cross-references against the equation text dictionary.
 *
 * Usage:
 *   node tools/audit-equation-text.js [--chapter <num>] [--verbose]
 *
 * Options:
 *   --chapter <num>   Audit specific chapter (default: all)
 *   --verbose         Show translated entries too
 */

import fs from 'fs';
import path from 'path';

let BOOKS_DIR = 'books/efnafraedi';

function parseArgs(args) {
  const result = { chapter: null, book: 'efnafraedi', verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i]);
    else if (args[i] === '--book' && args[i + 1]) result.book = args[++i];
    else if (args[i] === '--verbose') result.verbose = true;
  }
  return result;
}

function loadDictionary() {
  const dictPath = path.join(BOOKS_DIR, 'glossary', 'equation-text.json');
  try {
    const data = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    return data.translations;
  } catch {
    console.error('Warning: No equation-text.json found at', dictPath);
    return {};
  }
}

function isTranslatable(text) {
  const t = text.trim();
  // Skip empty, single char, pure numbers
  if (t.length <= 1) return false;
  if (/^\d+[.,]?\d*$/.test(t)) return false;
  // Skip single element symbols (H, O, Na, etc.)
  if (/^[A-Z][a-z]?$/.test(t)) return false;
  // Must contain multi-letter lowercase word
  return /[a-z]{2,}/.test(t);
}

function checkTranslation(text, dictionary) {
  // Check if the text (or its words) would be translated by the dictionary
  const lower = text.toLowerCase();
  for (const [en] of Object.entries(dictionary)) {
    const pattern = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) return { translated: true, by: en };
  }
  return { translated: false };
}

function findEquationFiles(chapter) {
  const structureDir = path.join(BOOKS_DIR, '02-structure');
  const chapters = chapter
    ? [`ch${String(chapter).padStart(2, '0')}`]
    : fs
        .readdirSync(structureDir)
        .filter((d) => d.startsWith('ch'))
        .sort();

  const files = [];
  for (const ch of chapters) {
    const chDir = path.join(structureDir, ch);
    if (!fs.existsSync(chDir)) continue;
    const eqFiles = fs.readdirSync(chDir).filter((f) => f.endsWith('-equations.json'));
    for (const f of eqFiles) {
      files.push(path.join(chDir, f));
    }
  }
  return files.sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  BOOKS_DIR = `books/${args.book}`;
  const dictionary = loadDictionary();
  const dictEntries = Object.keys(dictionary).length;

  // Find equation files
  const files = findEquationFiles(args.chapter);

  if (files.length === 0) {
    console.error('No equation files found');
    process.exit(1);
  }

  // Collect all mtext values with their locations
  const textOccurrences = new Map(); // text → [{file, eqId, mathml}]
  let totalEquations = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [eqId, eq] of Object.entries(data)) {
      totalEquations++;
      if (!eq.mathml) continue;

      const mtextMatches = eq.mathml.matchAll(/<m:mtext>([^<]+)<\/m:mtext>/g);
      for (const m of mtextMatches) {
        const text = m[1].trim();
        if (!isTranslatable(text)) continue;

        if (!textOccurrences.has(text)) textOccurrences.set(text, []);
        textOccurrences.get(text).push({
          file: path.relative(BOOKS_DIR, file),
          eqId,
          latex: eq.latex || '',
        });
      }
    }
  }

  // Analyze translation coverage
  const untranslated = [];
  const fullyTranslated = [];

  for (const [text, occurrences] of textOccurrences) {
    const result = checkTranslation(text, dictionary);
    if (result.translated) {
      fullyTranslated.push({ text, occurrences, by: result.by });
    } else {
      untranslated.push({ text, occurrences });
    }
  }

  // Sort by frequency (most common first)
  untranslated.sort((a, b) => b.occurrences.length - a.occurrences.length);
  fullyTranslated.sort((a, b) => b.occurrences.length - a.occurrences.length);

  // Report
  console.log('=== Equation Text Audit ===');
  console.log(`Dictionary entries: ${dictEntries}`);
  console.log(`Equation files scanned: ${files.length}`);
  console.log(`Total equations: ${totalEquations}`);
  console.log(`Unique translatable text strings: ${textOccurrences.size}`);
  console.log();
  console.log(
    `Translated: ${fullyTranslated.length} (${Math.round((fullyTranslated.length / textOccurrences.size) * 100)}%)`
  );
  console.log(
    `Untranslated: ${untranslated.length} (${Math.round((untranslated.length / textOccurrences.size) * 100)}%)`
  );
  console.log();

  if (untranslated.length > 0) {
    console.log('--- UNTRANSLATED (add to equation-text.json) ---');
    console.log();
    for (const { text, occurrences } of untranslated) {
      console.log(
        `  "${text}" (${occurrences.length} occurrence${occurrences.length > 1 ? 's' : ''})`
      );
      // Show one example equation for context
      const ex = occurrences[0];
      if (ex.latex) {
        const shortLatex = ex.latex.length > 100 ? ex.latex.slice(0, 100) + '...' : ex.latex;
        console.log(`    example: ${shortLatex}`);
      }
      console.log(`    in: ${ex.file} → ${ex.eqId}`);
      console.log();
    }
  }

  if (args.verbose && fullyTranslated.length > 0) {
    console.log('--- TRANSLATED ---');
    console.log();
    for (const { text, occurrences, by } of fullyTranslated) {
      console.log(
        `  "${text}" → matched by "${by}" → "${dictionary[by]}" (${occurrences.length}×)`
      );
    }
    console.log();
  }

  // Summary
  const coverage =
    textOccurrences.size > 0
      ? Math.round((fullyTranslated.length / textOccurrences.size) * 100)
      : 100;
  console.log(`Coverage: ${coverage}%`);

  if (untranslated.length > 0) {
    process.exit(1); // Non-zero exit for CI/scripting
  }
}

try {
  main();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
