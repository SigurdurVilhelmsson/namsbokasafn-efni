#!/usr/bin/env node
/**
 * generate-tool-inventory.js
 *
 * Generates documentation for CLI tools by extracting descriptions
 * from JSDoc comments and categorizing by status (active/deprecated).
 */
import fs from 'fs';
import path from 'path';

const toolsDir = 'tools';
const outputFile = 'docs/_generated/tools.md';

// Deprecated tools - no longer used in simplified workflow
const DEPRECATED_TOOLS = new Set([
  'cnxml-to-xliff',
  'create-bilingual-xliff',
  'md-to-xliff',
  'xliff-to-md',
  'xliff-to-tmx',
]);

// Core tools for extract-inject-render pipeline
const CORE_TOOLS = new Set([
  'cnxml-extract',
  'protect-segments-for-mt',
  'cnxml-inject',
  'cnxml-render',
  'prepare-for-align',
]);

// Manual descriptions for tools without proper JSDoc
const MANUAL_DESCRIPTIONS = {
  'cnxml-extract': 'Extract EN segments and structure from CNXML source',
  'cnxml-inject': 'Inject translated segments back into CNXML',
  'cnxml-render': 'Render translated CNXML to semantic HTML',
  'prepare-for-align': 'Prepare markdown files for Matecat Align',
  'protect-segments-for-mt': 'Protect segments for machine translation',
  'validate-chapter': 'Validate chapter structure and status',
  'cnxml-to-xliff': 'Convert CNXML to XLIFF format (DEPRECATED)',
  'create-bilingual-xliff': 'Create bilingual XLIFF from EN/IS pairs (DEPRECATED)',
  'md-to-xliff': 'Convert Markdown to XLIFF format (DEPRECATED)',
  'xliff-to-md': 'Convert XLIFF back to Markdown (DEPRECATED)',
  'xliff-to-tmx': 'Convert XLIFF to TMX format (DEPRECATED)',
};

/**
 * Extract description from tool file content
 */
function extractDescription(content, toolName) {
  // First check manual descriptions
  if (MANUAL_DESCRIPTIONS[toolName]) {
    return MANUAL_DESCRIPTIONS[toolName];
  }

  // Try to extract from JSDoc block
  // Look for: /** ... description line ... */
  const jsdocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  if (jsdocMatch) {
    const jsdocBlock = jsdocMatch[0];
    const lines = jsdocBlock.split('\n');

    // Skip the opening /**, the tool name line, and find first real description
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
        .replace(/^\s*\*\s?/, '') // Remove leading *
        .trim();

      // Skip empty lines, the tool name, and common headers
      if (
        !line ||
        line === '*/' ||
        line.toLowerCase().includes('.js') ||
        line.startsWith('@') ||
        line.startsWith('Usage:') ||
        line.startsWith('Options:') ||
        line.startsWith('Output:') ||
        line.startsWith('Features:')
      ) {
        continue;
      }

      // Found a description line
      return line.substring(0, 80);
    }
  }

  // Try commander/yargs .description() pattern
  const descMatch = content.match(/\.description\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (descMatch) {
    return descMatch[1].substring(0, 80);
  }

  return 'No description available';
}

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

// Get all .js files in tools/
const tools = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace('.js', ''))
  .sort();

// Categorize tools
const coreTools = tools.filter((t) => CORE_TOOLS.has(t));
const deprecatedTools = tools.filter((t) => DEPRECATED_TOOLS.has(t));
const utilityTools = tools.filter((t) => !CORE_TOOLS.has(t) && !DEPRECATED_TOOLS.has(t));

let output = `# CLI Tools

*Auto-generated from tools/ directory*

## Core Tools (Simplified Workflow)

| Tool | Description | Step |
|------|-------------|------|
`;

// Add core tools with step info
const stepInfo = {
  'cnxml-extract': '1a',
  'protect-segments-for-mt': '1b',
  'cnxml-inject': '5a',
  'cnxml-render': '5b',
  'prepare-for-align': '4',
};

for (const tool of coreTools) {
  const content = fs.readFileSync(path.join(toolsDir, `${tool}.js`), 'utf-8');
  const desc = extractDescription(content, tool);
  const step = stepInfo[tool] || '-';
  output += `| \`${tool}\` | ${desc} | ${step} |\n`;
}

output += `
## Utility Tools

| Tool | Description |
|------|-------------|
`;

for (const tool of utilityTools) {
  const content = fs.readFileSync(path.join(toolsDir, `${tool}.js`), 'utf-8');
  const desc = extractDescription(content, tool);
  output += `| \`${tool}\` | ${desc} |\n`;
}

output += `
## Deprecated Tools

These tools are deprecated and replaced by Matecat Align in the simplified workflow.

| Tool | Description |
|------|-------------|
`;

for (const tool of deprecatedTools) {
  const content = fs.readFileSync(path.join(toolsDir, `${tool}.js`), 'utf-8');
  const desc = extractDescription(content, tool);
  output += `| \`${tool}\` | ${desc} |\n`;
}

const activeCount = coreTools.length + utilityTools.length;
output += `
---

*${tools.length} tools total (${activeCount} active, ${deprecatedTools.length} deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
`;

fs.writeFileSync(outputFile, output);
console.log(`Generated ${outputFile} with ${tools.length} tools`);
