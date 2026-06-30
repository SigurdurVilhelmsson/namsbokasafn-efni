#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import { writeProvenance, readProvenance } from './lib/provenance.js';

/**
 * Stamp producer provenance onto pre-existing 02-mt-output content.
 * Rule: a chapter dir with import-report.json was docx-imported; otherwise api-translate.
 * Idempotent: modules that already have a provenance sidecar are skipped.
 * @param {string} bookDir e.g. books/efnafraedi-2e
 * @returns {{ stamped: number, skipped: number }}
 */
export function backfillBook(bookDir) {
  const mtRoot = path.join(bookDir, '02-mt-output');
  let stamped = 0;
  let skipped = 0;
  if (!fs.existsSync(mtRoot)) return { stamped, skipped };

  for (const entry of fs.readdirSync(mtRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const chDir = path.join(mtRoot, entry.name);
    const tool = fs.existsSync(path.join(chDir, 'import-report.json'))
      ? 'docx-import'
      : 'api-translate';

    for (const f of fs.readdirSync(chDir)) {
      const m = f.match(/^(m\d{5})-segments\.is\.md$/);
      if (!m) continue;
      const moduleId = m[1];
      if (readProvenance(chDir, moduleId)) {
        skipped++;
        continue;
      }
      writeProvenance(chDir, moduleId, { tool });
      stamped++;
    }
  }
  return { stamped, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION]);
  requireBook(args);
  const bookDir = path.join('books', args.book);
  const { stamped, skipped } = backfillBook(bookDir);
  console.log(`Backfill ${args.book}: stamped ${stamped}, skipped ${skipped} (already stamped).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
