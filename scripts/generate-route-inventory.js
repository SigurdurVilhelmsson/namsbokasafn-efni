#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const routesDir = 'server/routes';
const outputFile = 'docs/_generated/routes.md';

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

let output = `# API Routes

*Auto-generated from server/routes/*

`;

// Get all route files
const routeFiles = fs.readdirSync(routesDir)
  .filter(f => f.endsWith('.js'))
  .sort();

for (const file of routeFiles) {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
  const routeName = file.replace('.js', '');

  output += `## /${routeName}\n\n`;

  // Extract route definitions
  const routePattern = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
  let match;
  const routes = [];

  while ((match = routePattern.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }

  if (routes.length > 0) {
    output += `| Method | Path |\n|--------|------|\n`;
    for (const r of routes) {
      output += `| ${r.method} | \`${r.path}\` |\n`;
    }
  } else {
    output += `*No routes found*\n`;
  }

  output += '\n';
}

output += `
Generated: ${new Date().toISOString()}
`;

fs.writeFileSync(outputFile, output);
console.log(`Generated ${outputFile}`);
