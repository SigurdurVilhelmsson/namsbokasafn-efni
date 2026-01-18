#!/usr/bin/env node
import fs from 'fs';

const readmePath = 'README.md';

if (!fs.existsSync(readmePath)) {
  console.log('No README.md found, skipping');
  process.exit(0);
}

let readme = fs.readFileSync(readmePath, 'utf-8');

// Update tools section if marker exists
if (readme.includes('<!-- tools-start -->')) {
  const toolsContent = fs.existsSync('docs/_generated/tools.md')
    ? fs.readFileSync('docs/_generated/tools.md', 'utf-8')
    : '*Run `npm run docs:generate` to update*';

  readme = readme.replace(
    /<!-- tools-start -->[\s\S]*<!-- tools-end -->/,
    `<!-- tools-start -->\n${toolsContent}\n<!-- tools-end -->`
  );
}

// Update routes section if marker exists
if (readme.includes('<!-- routes-start -->')) {
  const routesContent = fs.existsSync('docs/_generated/routes.md')
    ? fs.readFileSync('docs/_generated/routes.md', 'utf-8')
    : '*Run `npm run docs:generate` to update*';

  readme = readme.replace(
    /<!-- routes-start -->[\s\S]*<!-- routes-end -->/,
    `<!-- routes-start -->\n${routesContent}\n<!-- routes-end -->`
  );
}

fs.writeFileSync(readmePath, readme);
console.log('Updated README.md sections');
