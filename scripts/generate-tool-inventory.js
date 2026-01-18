#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const toolsDir = 'tools';
const outputFile = 'docs/_generated/tools.md';

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

// Get all .js files in tools/
const tools = fs.readdirSync(toolsDir)
  .filter(f => f.endsWith('.js'))
  .sort();

let output = `# CLI Tools

*Auto-generated from tools/ directory*

| Tool | Description |
|------|-------------|
`;

for (const tool of tools) {
  const content = fs.readFileSync(path.join(toolsDir, tool), 'utf-8');

  // Try to extract description from comments or --help
  const descMatch = content.match(/description['":\s]+['"]([^'"]+)['"]/i) ||
                    content.match(/\/\/\s*(.+)/) ||
                    ['', 'No description'];

  const desc = descMatch[1].substring(0, 60);
  const name = tool.replace('.js', '');

  output += `| \`${name}\` | ${desc} |\n`;
}

output += `
*${tools.length} tools total*

Generated: ${new Date().toISOString()}
`;

fs.writeFileSync(outputFile, output);
console.log(`Generated ${outputFile} with ${tools.length} tools`);
