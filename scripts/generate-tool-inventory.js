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
  'xliff-to-tmx'
]);

// Core tools for simplified workflow
const CORE_TOOLS = new Set([
  'pipeline-runner',
  'cnxml-to-md',
  'split-for-erlendur',
  'prepare-for-align',
  'add-frontmatter'
]);

// Manual descriptions for tools without proper JSDoc
const MANUAL_DESCRIPTIONS = {
  'apply-equations': 'Restore LaTeX equations from JSON mapping file',
  'clean-markdown': 'Fix Pandoc artifacts (mspace, orphan directives, escaped tildes)',
  'cnxml-math-extract': 'Extract MathML equations from CNXML and convert to LaTeX',
  'cnxml-to-md': 'Convert CNXML to Markdown with equation placeholders',
  'cnxml-to-xliff': 'Convert CNXML to XLIFF format (DEPRECATED)',
  'create-bilingual-xliff': 'Create bilingual XLIFF from EN/IS pairs (DEPRECATED)',
  'docx-to-md': 'Convert DOCX files to Markdown format',
  'export-parallel-corpus': 'Export Translation Memory to parallel text files',
  'fix-figure-captions': 'Fix figure caption formatting issues',
  'md-to-xliff': 'Convert Markdown to XLIFF format (DEPRECATED)',
  'pipeline-runner': 'Full CNXML → Markdown pipeline with equation extraction',
  'prepare-for-align': 'Prepare markdown files for Matecat Align',
  'process-chapter': 'Full chapter processing pipeline',
  'repair-directives': 'Fix directive syntax issues in markdown',
  'replace-math-images': 'Replace equation images with LaTeX code',
  'split-for-erlendur': 'Split files at 18k characters for Erlendur MT',
  'strip-docx-to-txt': 'Extract plain text from DOCX files',
  'validate-chapter': 'Validate chapter structure and status',
  'xliff-to-md': 'Convert XLIFF back to Markdown (DEPRECATED)',
  'xliff-to-tmx': 'Convert XLIFF to TMX format (DEPRECATED)'
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
        .replace(/^\s*\*\s?/, '')  // Remove leading *
        .trim();

      // Skip empty lines, the tool name, and common headers
      if (!line ||
          line === '*/' ||
          line.toLowerCase().includes('.js') ||
          line.startsWith('@') ||
          line.startsWith('Usage:') ||
          line.startsWith('Options:') ||
          line.startsWith('Output:') ||
          line.startsWith('Features:')) {
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
const tools = fs.readdirSync(toolsDir)
  .filter(f => f.endsWith('.js'))
  .map(f => f.replace('.js', ''))
  .sort();

// Categorize tools
const coreTools = tools.filter(t => CORE_TOOLS.has(t));
const deprecatedTools = tools.filter(t => DEPRECATED_TOOLS.has(t));
const utilityTools = tools.filter(t => !CORE_TOOLS.has(t) && !DEPRECATED_TOOLS.has(t));

let output = `# CLI Tools

*Auto-generated from tools/ directory*

## Core Tools (Simplified Workflow)

| Tool | Description | Step |
|------|-------------|------|
`;

// Add core tools with step info
const stepInfo = {
  'pipeline-runner': '1',
  'cnxml-to-md': '1',
  'split-for-erlendur': '1',
  'prepare-for-align': '4',
  'add-frontmatter': '5'
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
