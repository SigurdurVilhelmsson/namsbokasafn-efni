#!/usr/bin/env node
/**
 * Update chapter status
 *
 * Usage: node scripts/update-status.js <book> <chapter> <stage> <status>
 * Example: node scripts/update-status.js efnafraedi 1 matecat complete
 *
 * Valid stages:
 *   - source
 *   - mtOutput
 *   - matecat
 *   - editorialPass1
 *   - tmUpdated
 *   - editorialPass2
 *   - publication
 *
 * Valid statuses:
 *   - complete
 *   - in-progress
 *   - pending
 *   - not-started
 *
 * Options:
 *   --editor <name>    Set editor name (for editorialPass1/2)
 *   --version <ver>    Set version (for publication, e.g., "ai-preview", "v1.0")
 *   --notes <text>     Add notes to the stage
 *   --dry-run          Show what would change without writing
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const flag = args[i].slice(2);
    if (flag === 'dry-run') {
      flags.dryRun = true;
    } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[flag] = args[++i];
    }
  } else {
    positional.push(args[i]);
  }
}

const [book, chapter, stage, status] = positional;

const VALID_STAGES = [
  'source',
  'mtOutput',
  'matecat',
  'editorialPass1',
  'tmUpdated',
  'editorialPass2',
  'publication'
];

const VALID_STATUSES = ['complete', 'in-progress', 'pending', 'not-started'];

function printUsage() {
  console.log(`
Usage: node scripts/update-status.js <book> <chapter> <stage> <status> [options]

Arguments:
  book      Book ID (e.g., efnafraedi, liffraedi)
  chapter   Chapter number (e.g., 1, 2, 3)
  stage     Workflow stage: ${VALID_STAGES.join(', ')}
  status    Status value: ${VALID_STATUSES.join(', ')}

Options:
  --editor <name>    Set editor name (for editorialPass1/2)
  --version <ver>    Set version (for publication)
  --notes <text>     Add notes to the stage
  --dry-run          Show changes without writing

Examples:
  node scripts/update-status.js efnafraedi 1 matecat complete
  node scripts/update-status.js efnafraedi 2 editorialPass1 in-progress --editor "Anna"
  node scripts/update-status.js efnafraedi 1 publication complete --version "v1.0"
`);
}

// Validate inputs
if (!book || !chapter || !stage || !status) {
  console.error('Error: Missing required arguments\n');
  printUsage();
  process.exit(1);
}

if (!VALID_STAGES.includes(stage)) {
  console.error(`Error: Invalid stage "${stage}"`);
  console.error(`Valid stages: ${VALID_STAGES.join(', ')}`);
  process.exit(1);
}

if (!VALID_STATUSES.includes(status)) {
  console.error(`Error: Invalid status "${status}"`);
  console.error(`Valid statuses: ${VALID_STATUSES.join(', ')}`);
  process.exit(1);
}

// Build path to status.json
const chapterPadded = chapter.toString().padStart(2, '0');
const statusPath = path.join(
  __dirname,
  '..',
  'books',
  book,
  'chapters',
  `ch${chapterPadded}`,
  'status.json'
);

// Check if file exists
if (!fs.existsSync(statusPath)) {
  console.error(`Error: Status file not found: ${statusPath}`);
  console.error(`Make sure the book "${book}" and chapter ${chapter} exist.`);
  process.exit(1);
}

// Read current status
let data;
try {
  data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
} catch (err) {
  console.error(`Error reading status file: ${err.message}`);
  process.exit(1);
}

// Store original for comparison
const original = JSON.stringify(data.status[stage], null, 2);

// Update the stage
const today = new Date().toISOString().split('T')[0];
const stageData = data.status[stage] || {};

// Set completion status
if (status === 'complete') {
  stageData.complete = true;
  stageData.date = today;
  stageData.inProgress = false;
  stageData.pending = false;
} else if (status === 'in-progress') {
  stageData.complete = false;
  stageData.inProgress = true;
  stageData.pending = false;
} else if (status === 'pending') {
  stageData.complete = false;
  stageData.inProgress = false;
  stageData.pending = true;
} else if (status === 'not-started') {
  stageData.complete = false;
  stageData.date = null;
  stageData.inProgress = false;
  stageData.pending = false;
}

// Apply optional flags
if (flags.editor && (stage === 'editorialPass1' || stage === 'editorialPass2')) {
  stageData.editor = flags.editor;
}

if (flags.version && stage === 'publication') {
  stageData.version = flags.version;
}

if (flags.notes) {
  stageData.notes = flags.notes;
}

// Update the data
data.status[stage] = stageData;

// Show changes
console.log(`\n${book} chapter ${chapter} - ${stage}`);
console.log('─'.repeat(40));
console.log(`Before: ${original}`);
console.log(`After:  ${JSON.stringify(stageData, null, 2)}`);

if (flags.dryRun) {
  console.log('\n[DRY RUN] No changes written.');
  process.exit(0);
}

// Write updated status
try {
  fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n✓ Updated ${statusPath}`);
} catch (err) {
  console.error(`Error writing status file: ${err.message}`);
  process.exit(1);
}
