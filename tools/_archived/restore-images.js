#!/usr/bin/env node

/**
 * restore-images.js
 *
 * Post-MT processing script that reconstructs image markdown syntax.
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    input: null,
    figures: null,
    output: null,
    inPlace: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--figures' && args[i + 1]) result.figures = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }

  return result;
}

function printHelp() {
  console.log('restore-images.js - Reconstruct image markdown syntax after MT');
  console.log('');
  console.log('Usage:');
  console.log('  node tools/restore-images.js <input.md> --figures <figures.json> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --figures <file>  Path to the figures sidecar JSON (required)');
  console.log('  --output <file>   Write to specified file (default: stdout)');
  console.log('  --in-place        Modify the input file in place');
  console.log('  --verbose, -v     Show processing details');
}

function restoreImages(content, figuresData, verbose) {
  let imagesRestored = 0;
  const figures = figuresData.figures || {};

  // Pattern matches broken image attributes (possibly multi-line):
  // {id="CNX_Chem_05_00_Match" class="splash" alt="..."}
  const brokenImagePattern =
    /^\{id="(CNX_Chem_\d+_\d+_\w+)"(?:\s+class="([^"]*)")?(?:\s+alt="([\s\S]*?)")?\}$/gm;

  const result = content.replace(brokenImagePattern, (match, figureId, cssClass, altText) => {
    const figure = figures[figureId];

    if (!figure) {
      if (verbose) {
        console.error('  Warning: Figure not found in sidecar: ' + figureId);
      }
      return match;
    }

    imagesRestored++;

    const imagePath = 'images/media/' + figure.imagePath;
    const classAttr = cssClass ? ' .' + cssClass : figure.class ? ' .' + figure.class : '';
    const alt = (altText || figure.altText || '').replace(/\n/g, ' ').trim();

    if (verbose) {
      console.error('  Restored image: ' + figureId + ' -> ' + imagePath);
    }

    return '![](' + imagePath + '){#' + figureId + classAttr + ' alt="' + alt + '"}';
  });

  return { content: result, imagesRestored };
}

function processFile(filePath, figuresPath, options) {
  const { verbose, inPlace, output } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found: ' + filePath };
  }

  if (!fs.existsSync(figuresPath)) {
    return { success: false, error: 'Figures sidecar not found: ' + figuresPath };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const figuresData = JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));

  const { content: restoredContent, imagesRestored } = restoreImages(content, figuresData, verbose);

  if (imagesRestored === 0 && verbose) {
    console.error('  No broken images found in: ' + filePath);
  }

  if (inPlace) {
    fs.writeFileSync(filePath, restoredContent);
    if (verbose) {
      console.error('  Modified: ' + filePath);
    }
  } else if (output) {
    fs.writeFileSync(output, restoredContent);
    if (verbose) {
      console.error('  Wrote: ' + output);
    }
  } else {
    console.log(restoredContent);
  }

  return { success: true, imagesRestored };
}

export { processFile, restoreImages };

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide an input file');
    process.exit(1);
  }

  if (!args.figures) {
    console.error('Error: Please provide --figures <figures.json>');
    process.exit(1);
  }

  try {
    const result = processFile(path.resolve(args.input), path.resolve(args.figures), args);

    if (!result.success) {
      console.error('Error: ' + result.error);
      process.exit(1);
    }

    if (result.imagesRestored > 0) {
      console.error('Images restored: ' + result.imagesRestored);
    }
  } catch (err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  }
}

if (import.meta.url === 'file://' + process.argv[1]) {
  main();
}
