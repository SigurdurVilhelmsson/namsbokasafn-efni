#!/usr/bin/env node

/**
 * translate-markdown.js — Translate a Markdown file EN→IS via Málstaður API
 *
 * Splits the markdown by level-2 headings, translates each section,
 * and reassembles. Preserves image paths, code blocks, and markdown syntax.
 *
 * Usage:
 *   node tools/translate-markdown.js <input.md> <output.md>
 *
 * Environment:
 *   MALSTADUR_API_KEY   API key from Miðeind
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './lib/malstadur-api.js';
import { loadEnvFile } from './api-translate.js';

// Load .env if API key not in environment
if (!process.env.MALSTADUR_API_KEY) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '..', '.env');
  const envVars = loadEnvFile(envPath);
  if (envVars.MALSTADUR_API_KEY) {
    process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
  }
}

// ─── Split markdown into sections ──────────────────────────────────

function splitBySections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (line.startsWith('## ') && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error('Usage: node tools/translate-markdown.js <input.md> <output.md>');
    process.exit(1);
  }

  const markdown = fs.readFileSync(path.resolve(inputPath), 'utf-8');
  const sections = splitBySections(markdown);

  console.log(`Translating ${inputPath} → ${outputPath}`);
  console.log(`Split into ${sections.length} sections`);

  const client = createClient({ rateDelayMs: 600 });
  const translatedSections = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const preview = section.substring(0, 60).replace(/\n/g, ' ');
    const chars = section.length;

    if (chars < 10) {
      // Skip near-empty sections
      translatedSections.push(section);
      continue;
    }

    console.log(`  [${i + 1}/${sections.length}] (${chars} chars) ${preview}...`);

    try {
      const result = await client.translate(section, { targetLanguage: 'is' });
      translatedSections.push(result.text);
    } catch (err) {
      console.error(`  ⚠ Section ${i + 1} failed: ${err.message}`);
      console.error(`    Keeping original text for this section`);
      translatedSections.push(section);
    }
  }

  const output = translatedSections.join('\n\n');
  fs.writeFileSync(path.resolve(outputPath), output, 'utf-8');

  const usage = client.getUsage();
  console.log(`\nDone! Written to ${outputPath}`);
  console.log(
    `API usage: ${usage.totalChars} chars, ${usage.requestCount} requests, ~${Math.round(usage.estimatedISK)} ISK`
  );
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
