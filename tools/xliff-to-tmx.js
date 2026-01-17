#!/usr/bin/env node

/**
 * xliff-to-tmx.js
 *
 * Extracts translation memory from reviewed XLIFF files.
 * Outputs TMX (Translation Memory eXchange) format compatible with
 * Matecat, Trados, MemoQ, OmegaT and other CAT tools.
 *
 * Usage:
 *   node tools/xliff-to-tmx.js <xliff-file> [options]
 *
 * Output:
 *   - TMX file with source/target segment pairs
 *   - Only includes segments where target differs from source (actual translations)
 */

const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    sourceLang: null,
    targetLang: null,
    includeEmpty: false,
    includeUnchanged: false,
    creationTool: 'xliff-to-tmx.js',
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--include-empty') result.includeEmpty = true;
    else if (arg === '--include-unchanged') result.includeUnchanged = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--source-lang' && args[i + 1]) result.sourceLang = args[++i];
    else if (arg === '--target-lang' && args[i + 1]) result.targetLang = args[++i];
    else if (arg === '--tool' && args[i + 1]) result.creationTool = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
xliff-to-tmx.js - Extract translation memory from reviewed XLIFF

Converts translated XLIFF files to TMX format for reuse in future
translation projects. By default, only includes segments where the
target text differs from source (actual translations).

Usage:
  node tools/xliff-to-tmx.js <xliff-file> [options]

Options:
  --output <file>       Output TMX file (default: stdout)
  --source-lang <lang>  Override source language from XLIFF
  --target-lang <lang>  Override target language from XLIFF
  --include-empty       Include segments with empty targets
  --include-unchanged   Include segments where target equals source
  --tool <name>         Set creation tool name (default: xliff-to-tmx.js)
  --verbose             Show detailed progress
  -h, --help            Show this help message

Examples:
  node tools/xliff-to-tmx.js 04-matecat/chapters/01/1-5.xliff --output tm/exports/ch01-1-5.tmx
  node tools/xliff-to-tmx.js reviewed.xliff --include-unchanged --verbose
`);
}

function parseXliff(content, verbose) {
  const units = [];

  // Extract file attributes
  const fileMatch = content.match(/<file[^>]+>/);
  let sourceLang = 'en';
  let targetLang = 'is';
  let original = 'unknown';

  if (fileMatch) {
    const srcMatch = fileMatch[0].match(/source-language="([^"]+)"/);
    const tgtMatch = fileMatch[0].match(/target-language="([^"]+)"/);
    const origMatch = fileMatch[0].match(/original="([^"]+)"/);

    if (srcMatch) sourceLang = srcMatch[1];
    if (tgtMatch) targetLang = tgtMatch[1];
    if (origMatch) original = origMatch[1];
  }

  // Extract translation units
  const unitPattern = /<trans-unit[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let match;

  while ((match = unitPattern.exec(content)) !== null) {
    const id = match[1];
    const unitContent = match[2];

    const sourceMatch = unitContent.match(/<source>([\s\S]*?)<\/source>/);
    const targetMatch = unitContent.match(/<target[^>]*>([\s\S]*?)<\/target>/);

    const source = sourceMatch ? stripXliffInline(sourceMatch[1]) : '';
    const target = targetMatch ? stripXliffInline(targetMatch[1]) : '';

    // Extract target state if present
    const stateMatch = unitContent.match(/<target[^>]+state="([^"]+)"/);
    const state = stateMatch ? stateMatch[1] : 'new';

    units.push({
      id,
      source: unescapeXml(source),
      target: unescapeXml(target),
      state
    });
  }

  if (verbose) {
    console.error('Parsed XLIFF: ' + original);
    console.error('Source language: ' + sourceLang);
    console.error('Target language: ' + targetLang);
    console.error('Total units: ' + units.length);

    const translated = units.filter(u => u.target && u.target !== u.source).length;
    const empty = units.filter(u => !u.target).length;
    const unchanged = units.filter(u => u.target && u.target === u.source).length;

    console.error('Translated: ' + translated);
    console.error('Empty: ' + empty);
    console.error('Unchanged: ' + unchanged);
  }

  return { sourceLang, targetLang, original, units };
}

function stripXliffInline(text) {
  // Remove XLIFF inline elements but preserve their content
  // <x .../> → extract equiv-text if present
  let result = text.replace(/<x[^>]+equiv-text="([^"]+)"[^>]*\/>/g, '$1');
  result = result.replace(/<x[^>]*\/>/g, '');

  // <g ...>content</g> → content
  result = result.replace(/<g[^>]*>([\s\S]*?)<\/g>/g, '$1');

  // <bx .../> and <ex .../> paired elements
  result = result.replace(/<bx[^>]*\/>/g, '');
  result = result.replace(/<ex[^>]*\/>/g, '');

  // <ph ...>content</ph> → content or empty
  result = result.replace(/<ph[^>]*>([\s\S]*?)<\/ph>/g, '$1');
  result = result.replace(/<ph[^>]*\/>/g, '');

  // <it ...>content</it> → content
  result = result.replace(/<it[^>]*>([\s\S]*?)<\/it>/g, '$1');

  return result.trim();
}

function unescapeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateTmx(data, options) {
  const { sourceLang, targetLang, original, units } = data;
  const srcLang = options.sourceLang || sourceLang;
  const tgtLang = options.targetLang || targetLang;

  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // Filter units based on options
  const filteredUnits = units.filter(unit => {
    if (!unit.target && !options.includeEmpty) return false;
    if (unit.target === unit.source && !options.includeUnchanged) return false;
    return true;
  });

  let tmx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tmx SYSTEM "tmx14.dtd">
<tmx version="1.4">
  <header
    creationtool="${escapeXml(options.creationTool)}"
    creationtoolversion="1.0"
    segtype="sentence"
    o-tmf="xliff"
    adminlang="en"
    srclang="${srcLang}"
    datatype="plaintext"
    creationdate="${now}"
    creationid="namsbokasafn-efni"
  >
    <note>Extracted from: ${escapeXml(original)}</note>
    <note>Total translation units: ${filteredUnits.length}</note>
  </header>
  <body>`;

  for (const unit of filteredUnits) {
    tmx += `
    <tu tuid="${escapeXml(unit.id)}" datatype="plaintext">
      <tuv xml:lang="${srcLang}">
        <seg>${escapeXml(unit.source)}</seg>
      </tuv>
      <tuv xml:lang="${tgtLang}">
        <seg>${escapeXml(unit.target)}</seg>
      </tuv>
    </tu>`;
  }

  tmx += `
  </body>
</tmx>`;

  return { tmx, count: filteredUnits.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide an XLIFF file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(args.input)) {
      throw new Error('File not found: ' + args.input);
    }

    const content = fs.readFileSync(args.input, 'utf-8');
    if (args.verbose) console.error('Read ' + content.length + ' bytes from ' + args.input);

    const data = parseXliff(content, args.verbose);
    const { tmx, count } = generateTmx(data, args);

    if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, tmx);
      console.error('TMX written to: ' + args.output);
      console.error('Translation units exported: ' + count);
    } else {
      console.log(tmx);
    }

  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
