#!/usr/bin/env node

/**
 * check-openstax-errata.js
 *
 * Track and manage OpenStax errata for Chemistry 2e.
 * Supports importing errata from the OpenStax API or a saved JSON file,
 * recording review decisions, and generating reports.
 *
 * Commands:
 *   fetch                     Try to fetch errata from OpenStax API
 *   import <file>             Import errata from a saved JSON file
 *   status                    Show current tracking status
 *   review <id> [options]     Record a decision for an erratum
 *   report                    Generate a full report
 *   pending                   Show errata needing review
 *
 * Options:
 *   --decision <d>            Decision: accepted, rejected, deferred, not-applicable
 *   --notes "..."             Review notes
 *   --applied                 Mark as applied to our content
 *   --chapter <num>           Filter by chapter number
 *   --verbose                 Show detailed output
 *   -h, --help                Show this help
 *
 * Setup:
 *   The OpenStax errata API blocks non-browser requests. To import errata:
 *   1. Visit https://openstax.org/errata?book=Chemistry%202e in your browser
 *   2. Open DevTools → Network → find the API request to /apps/cms/api/errata/
 *   3. Copy the JSON response and save to a file
 *   4. Run: node tools/check-openstax-errata.js import <saved-file.json>
 *
 *   Alternatively, the fetch command will attempt the API directly (may fail
 *   with 403 depending on network environment).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books', 'efnafraedi');
const ERRATA_DIR = path.join(BOOKS_DIR, 'errata');
const LOG_PATH = path.join(ERRATA_DIR, 'errata-log.json');

// OpenStax API endpoint (may return 403 from non-browser environments)
const OPENSTAX_API = 'https://openstax.org/apps/cms/api/errata/';
const BOOK_TITLE = 'Chemistry 2e';

// Valid decisions for our review
const VALID_DECISIONS = ['accepted', 'rejected', 'deferred', 'not-applicable'];

// ============================================================================
// Errata Log Management
// ============================================================================

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    const initial = {
      bookTitle: BOOK_TITLE,
      bookSlug: 'chemistry-2e',
      openstaxBookId: null,
      lastFetched: null,
      lastReviewed: null,
      entries: {},
    };
    fs.mkdirSync(ERRATA_DIR, { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
}

// ============================================================================
// OpenStax API / Import
// ============================================================================

/**
 * Normalize an OpenStax errata item from the API response format
 * into our internal format.
 */
function normalizeErratum(item) {
  return {
    openstaxId: item.id,
    status: item.status || 'Unknown',
    errorType: item.error_type || item.errorType || null,
    location: item.location || null,
    additionalLocation: item.additional_location_information || null,
    detail: item.detail || item.short_detail || '',
    shortDetail: item.short_detail || '',
    resolution: item.resolution || null,
    resolutionNotes: item.resolution_notes || null,
    createdAt: item.created || null,
    modifiedAt: item.modified || null,
    reviewedDate: item.reviewed_date || null,
    correctedDate: item.corrected_date || null,
    archived: item.archived || false,
    // Our tracking fields (preserved from existing log if present)
    ourDecision: null,
    ourNotes: null,
    applied: false,
    reviewedByUs: null,
  };
}

/**
 * Parse chapter/section from an erratum's location field.
 * OpenStax locations are typically like "5.2" or "Chapter 5" or "p. 123".
 */
function parseChapter(location) {
  if (!location) return null;
  // Try "X.Y" pattern
  const dotMatch = location.match(/(\d+)\.\d/);
  if (dotMatch) return parseInt(dotMatch[1], 10);
  // Try "Chapter X" pattern
  const chMatch = location.match(/chapter\s+(\d+)/i);
  if (chMatch) return parseInt(chMatch[1], 10);
  return null;
}

/**
 * Try to fetch errata from the OpenStax API.
 * May fail with 403 from non-browser environments.
 */
async function fetchErrata(verbose) {
  const url = `${OPENSTAX_API}?book_title=${encodeURIComponent(BOOK_TITLE)}&ordering=-created`;

  if (verbose) {
    console.log(`Fetching: ${url}`);
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; namsbokasafn-errata-checker/1.0)',
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.error('API returned 403 Forbidden (non-browser requests are blocked).');
        console.error('');
        console.error('To import errata manually:');
        console.error('  1. Visit https://openstax.org/errata?book=Chemistry%202e in your browser');
        console.error(
          '  2. Open DevTools > Network > find the API request to /apps/cms/api/errata/'
        );
        console.error('  3. Copy the JSON response and save to a file');
        console.error('  4. Run: node tools/check-openstax-errata.js import <saved-file.json>');
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.results || data.items || [data];
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ENOTFOUND') {
      console.error(`Network error: ${error.message}`);
    } else {
      console.error(`Fetch failed: ${error.message}`);
    }
    return null;
  }
}

/**
 * Import errata from a saved JSON file.
 * Accepts various formats:
 *   - Array of errata objects
 *   - Object with "results" or "items" array
 *   - Single erratum object
 */
function importFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let items;
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw.results && Array.isArray(raw.results)) {
    items = raw.results;
  } else if (raw.items && Array.isArray(raw.items)) {
    items = raw.items;
  } else if (raw.id) {
    // Single erratum object
    items = [raw];
  } else {
    throw new Error(
      'Unrecognized JSON format. Expected an array of errata or an object with "results" or "items".'
    );
  }

  return items;
}

/**
 * Merge fetched/imported errata into the log.
 * Preserves our existing decisions — only updates OpenStax fields.
 */
function mergeErrata(log, items) {
  let newCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const normalized = normalizeErratum(item);
    const id = String(normalized.openstaxId);

    const existing = log.entries[id];
    if (existing) {
      // Update OpenStax fields, preserve our decisions
      const updated = {
        ...normalized,
        ourDecision: existing.ourDecision,
        ourNotes: existing.ourNotes,
        applied: existing.applied,
        reviewedByUs: existing.reviewedByUs,
      };

      // Check if anything changed on the OpenStax side
      const changed =
        existing.status !== updated.status ||
        existing.resolution !== updated.resolution ||
        existing.correctedDate !== updated.correctedDate;

      if (changed) {
        log.entries[id] = updated;
        updatedCount++;
      }
    } else {
      log.entries[id] = normalized;
      newCount++;
    }
  }

  log.lastFetched = new Date().toISOString();

  return { newCount, updatedCount };
}

// ============================================================================
// Reports
// ============================================================================

/**
 * Get entries as a sorted array.
 */
function getEntries(log, filter = {}) {
  let entries = Object.entries(log.entries).map(([id, entry]) => ({
    id,
    ...entry,
  }));

  // Filter by chapter
  if (filter.chapter) {
    entries = entries.filter((e) => {
      const ch = parseChapter(e.location);
      return ch === filter.chapter;
    });
  }

  // Filter by our decision status
  if (filter.pending) {
    entries = entries.filter((e) => !e.ourDecision);
  }

  if (filter.decision) {
    entries = entries.filter((e) => e.ourDecision === filter.decision);
  }

  // Sort by OpenStax ID (most recent first)
  entries.sort((a, b) => (b.openstaxId || 0) - (a.openstaxId || 0));

  return entries;
}

function printStatus(log) {
  const entries = Object.values(log.entries);
  const total = entries.length;
  const pending = entries.filter((e) => !e.ourDecision).length;
  const accepted = entries.filter((e) => e.ourDecision === 'accepted').length;
  const rejected = entries.filter((e) => e.ourDecision === 'rejected').length;
  const deferred = entries.filter((e) => e.ourDecision === 'deferred').length;
  const notApplicable = entries.filter((e) => e.ourDecision === 'not-applicable').length;
  const applied = entries.filter((e) => e.applied).length;

  // OpenStax status breakdown
  const statusCounts = {};
  for (const e of entries) {
    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
  }

  console.log(`OpenStax Errata Tracker: ${log.bookTitle}`);
  console.log('='.repeat(50));
  console.log(`Last fetched: ${log.lastFetched || 'never'}`);
  console.log(`Last reviewed: ${log.lastReviewed || 'never'}`);
  console.log('');
  console.log(`Total errata tracked: ${total}`);
  console.log('');
  console.log('OpenStax status:');
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log('');
  console.log('Our review:');
  console.log(`  Pending review: ${pending}`);
  console.log(`  Accepted:       ${accepted} (${applied} applied)`);
  console.log(`  Rejected:       ${rejected}`);
  console.log(`  Deferred:       ${deferred}`);
  console.log(`  Not applicable: ${notApplicable}`);

  if (pending > 0) {
    console.log('');
    console.log(`Run 'node tools/check-openstax-errata.js pending' to see items needing review.`);
  }
}

function printEntries(entries, verbose) {
  if (entries.length === 0) {
    console.log('No errata found matching criteria.');
    return;
  }

  for (const entry of entries) {
    const decision = entry.ourDecision ? `[${entry.ourDecision.toUpperCase()}]` : '[PENDING]';
    const applied = entry.applied ? ' (applied)' : '';
    const chapter = parseChapter(entry.location);
    const chStr = chapter ? `Ch.${chapter}` : '';

    console.log(
      `#${entry.openstaxId} ${decision}${applied} ${entry.status} | ${entry.errorType || '-'} | ${chStr} ${entry.location || '-'}`
    );

    if (verbose) {
      if (entry.detail) {
        // Truncate long details
        const detail =
          entry.detail.length > 200 ? entry.detail.substring(0, 200) + '...' : entry.detail;
        console.log(`  Detail: ${detail}`);
      }
      if (entry.resolution) {
        console.log(`  Resolution: ${entry.resolution}`);
      }
      if (entry.resolutionNotes) {
        console.log(`  Resolution notes: ${entry.resolutionNotes}`);
      }
      if (entry.ourNotes) {
        console.log(`  Our notes: ${entry.ourNotes}`);
      }
      console.log('');
    }
  }

  console.log(`\n${entries.length} erratum/errata shown.`);
}

function printReport(log, filter) {
  const entries = getEntries(log, filter);

  console.log(`OpenStax Errata Report: ${log.bookTitle}`);
  if (filter.chapter) {
    console.log(`Filtered: Chapter ${filter.chapter}`);
  }
  console.log('='.repeat(50));
  console.log('');

  // Group by chapter
  const byChapter = {};
  const noChapter = [];

  for (const entry of entries) {
    const ch = parseChapter(entry.location);
    if (ch) {
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(entry);
    } else {
      noChapter.push(entry);
    }
  }

  // Print by chapter
  for (const ch of Object.keys(byChapter).sort((a, b) => a - b)) {
    console.log(`Chapter ${ch} (${byChapter[ch].length} errata):`);
    for (const entry of byChapter[ch]) {
      const decision = entry.ourDecision ? entry.ourDecision.toUpperCase() : 'PENDING';
      const applied = entry.applied ? ' [applied]' : '';
      console.log(
        `  #${entry.openstaxId} [${decision}]${applied} ${entry.errorType || '-'}: ${entry.location}`
      );
      if (entry.shortDetail || entry.detail) {
        const text = (entry.shortDetail || entry.detail).substring(0, 100);
        console.log(`    ${text}`);
      }
    }
    console.log('');
  }

  if (noChapter.length > 0) {
    console.log(`General / no chapter (${noChapter.length} errata):`);
    for (const entry of noChapter) {
      const decision = entry.ourDecision ? entry.ourDecision.toUpperCase() : 'PENDING';
      console.log(
        `  #${entry.openstaxId} [${decision}] ${entry.errorType || '-'}: ${entry.location || 'unknown'}`
      );
    }
    console.log('');
  }

  // Summary
  const pending = entries.filter((e) => !e.ourDecision).length;
  const accepted = entries.filter((e) => e.ourDecision === 'accepted').length;
  const applied = entries.filter((e) => e.applied).length;

  console.log('---');
  console.log(
    `Total: ${entries.length} | Pending: ${pending} | Accepted: ${accepted} (${applied} applied)`
  );
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args) {
  const result = {
    command: null,
    file: null,
    id: null,
    decision: null,
    notes: null,
    applied: false,
    chapter: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--applied') result.applied = true;
    else if (arg === '--decision' && args[i + 1]) result.decision = args[++i];
    else if (arg === '--notes' && args[i + 1]) result.notes = args[++i];
    else if (arg === '--chapter' && args[i + 1]) {
      result.chapter = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-') && !result.command) result.command = arg;
    else if (!arg.startsWith('-') && result.command === 'import' && !result.file) {
      result.file = arg;
    } else if (!arg.startsWith('-') && result.command === 'review' && !result.id) {
      result.id = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
check-openstax-errata.js - Track OpenStax errata for Chemistry 2e

Commands:
  fetch                     Fetch errata from OpenStax API (may need manual import)
  import <file>             Import errata from a saved JSON file
  status                    Show current tracking overview
  review <id> [options]     Record a decision for an erratum
  report                    Generate a chapter-organized report
  pending                   Show errata needing our review

Review Options:
  --decision <d>            Decision: accepted, rejected, deferred, not-applicable
  --notes "..."             Review notes (why this decision)
  --applied                 Mark as applied to our Icelandic content

Filter Options:
  --chapter <num>           Filter by chapter number
  --verbose                 Show full details

Setup (manual import):
  The OpenStax API blocks non-browser requests. To get the data:
  1. Open https://openstax.org/errata?book=Chemistry%202e in your browser
  2. In DevTools > Network, find the XHR request to /apps/cms/api/errata/
  3. Right-click > Copy Response, save to a file
  4. Run: node tools/check-openstax-errata.js import <file.json>

Examples:
  node tools/check-openstax-errata.js fetch
  node tools/check-openstax-errata.js import errata-2026-02.json
  node tools/check-openstax-errata.js status
  node tools/check-openstax-errata.js pending --chapter 5
  node tools/check-openstax-errata.js review 12345 --decision accepted --notes "Typo fix applied"
  node tools/check-openstax-errata.js review 12346 --decision not-applicable --notes "Answer key only"
  node tools/check-openstax-errata.js report --chapter 5
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const log = loadLog();

  switch (args.command) {
    case 'fetch': {
      console.log(`Attempting to fetch errata for "${BOOK_TITLE}"...`);
      const items = await fetchErrata(args.verbose);
      if (!items) {
        process.exit(1);
      }
      const { newCount, updatedCount } = mergeErrata(log, items);
      saveLog(log);
      console.log(`Fetched ${items.length} errata.`);
      console.log(`  New: ${newCount}, Updated: ${updatedCount}`);
      break;
    }

    case 'import': {
      if (!args.file) {
        console.error('Error: import requires a file path');
        console.error('Usage: node tools/check-openstax-errata.js import <file.json>');
        process.exit(1);
      }
      try {
        const items = importFromFile(args.file);
        const { newCount, updatedCount } = mergeErrata(log, items);
        saveLog(log);
        console.log(`Imported ${items.length} errata from ${args.file}`);
        console.log(`  New: ${newCount}, Updated: ${updatedCount}`);
      } catch (error) {
        console.error(`Import failed: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      printStatus(log);
      break;
    }

    case 'pending': {
      const entries = getEntries(log, {
        pending: true,
        chapter: args.chapter,
      });
      console.log('Errata pending review:');
      console.log('');
      printEntries(entries, args.verbose);
      break;
    }

    case 'review': {
      if (!args.id) {
        console.error('Error: review requires an erratum ID');
        console.error(
          'Usage: node tools/check-openstax-errata.js review <id> --decision <decision>'
        );
        process.exit(1);
      }
      if (!args.decision && !args.notes && !args.applied) {
        console.error('Error: review requires at least --decision, --notes, or --applied');
        process.exit(1);
      }
      if (args.decision && !VALID_DECISIONS.includes(args.decision)) {
        console.error(
          `Error: invalid decision "${args.decision}". Valid: ${VALID_DECISIONS.join(', ')}`
        );
        process.exit(1);
      }

      const entry = log.entries[args.id];
      if (!entry) {
        console.error(`Error: erratum #${args.id} not found in log`);
        console.error('Run "fetch" or "import" first to populate the errata log.');
        process.exit(1);
      }

      if (args.decision) entry.ourDecision = args.decision;
      if (args.notes) entry.ourNotes = args.notes;
      if (args.applied) entry.applied = true;
      entry.reviewedByUs = new Date().toISOString().split('T')[0];

      log.lastReviewed = new Date().toISOString();
      saveLog(log);

      console.log(`Updated erratum #${args.id}:`);
      console.log(`  Decision: ${entry.ourDecision}`);
      console.log(`  Applied: ${entry.applied}`);
      if (entry.ourNotes) console.log(`  Notes: ${entry.ourNotes}`);
      break;
    }

    case 'report': {
      printReport(log, { chapter: args.chapter });
      break;
    }

    default:
      console.error(`Unknown command: ${args.command}`);
      console.error('Use --help for usage information');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
