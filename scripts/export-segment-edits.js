#!/usr/bin/env node
/**
 * C16 clean break, step 1 of 2 (spec §6).
 *
 * Snapshots every segment_edits row for the named modules to a JSON file,
 * BEFORE the re-extract + re-MT that renumbers segments. Read-only: it never
 * writes to sessions.db and never writes under books/.
 *
 * Every row is exported whatever its status — exporting only the applied ones
 * would silently drop an editor's in-flight work, and that failure has no
 * symptom. reattach-segment-edits.js decides what re-enters the queue.
 *
 *   node scripts/export-segment-edits.js --book <slug> --modules m1,m2 --out <path>
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chapterDir } = require(path.join(REPO_ROOT, 'server', 'lib', 'chapterLabel.js'));

/** Segment id → text, from a `<!-- SEG: id -->` file. Returns {} when absent. */
function readSegmentMap(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const { parseSegments } = require(path.join(REPO_ROOT, 'server', 'services', 'segmentParser.js'));
  const out = {};
  for (const seg of parseSegments(fs.readFileSync(filePath, 'utf8'))) {
    out[seg.segmentId] = seg.content;
  }
  return out;
}

/**
 * The main-branch commit the snapshot was taken against — provenance for
 * which tree state the old segment ids came from, since the re-extract that
 * follows is one-way and irreversible. Never throws: an unavailable git or a
 * non-repo directory yields null, because the snapshot is the valuable
 * artifact and must still be written.
 */
function resolveMainCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

export function runExport({ book, modules, out, dbPath, booksDir }) {
  const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));
  const db = new Database(dbPath, { readonly: true });

  const placeholders = modules.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM segment_edits WHERE book = ? AND module_id IN (${placeholders})
       ORDER BY module_id, segment_id, id`
    )
    .all(book, ...modules);
  db.close();

  // Refuse a snapshot that is quietly short. Once Step 3 deletes the faithful
  // files this file is the ONLY record of the editorial work, and a module that
  // matched nothing looks exactly like a mistyped --modules or --book: the run
  // exits 0, prints a smaller row count, and every downstream gate still
  // balances, because reconcile() accounts only for the rows the snapshot
  // contained. The runbook's own numeric check is one-sided ("if it is much
  // larger than 62, stop") and 62 is declared a floor, so no smaller number
  // reads as wrong. A module with genuinely no edits is possible — but it is
  // not distinguishable from a typo here, so the operator confirms it by
  // dropping the module from --modules rather than by ignoring a silent gap.
  const matched = new Set(rows.map((r) => r.module_id));
  const empty = modules.filter((m) => !matched.has(m));
  if (empty.length) {
    throw new Error(
      `REFUSING TO WRITE SNAPSHOT — no rows for book '${book}', module(s): ${empty.join(', ')}.\n` +
        `This is the only record of the editorial work, and a mistyped --book or --modules is\n` +
        `indistinguishable from a module that legitimately has no edits. Check the spelling\n` +
        `against the DB; if a module really has none, drop it from --modules and re-run.`
    );
  }

  const cache = new Map();
  const contextFor = (row) => {
    const key = `${row.chapter}/${row.module_id}`;
    if (!cache.has(key)) {
      const chDir = chapterDir(row.chapter);
      cache.set(key, {
        en: readSegmentMap(
          path.join(booksDir, book, '02-for-mt', chDir, `${row.module_id}-segments.en.md`)
        ),
        mt: readSegmentMap(
          path.join(booksDir, book, '02-mt-output', chDir, `${row.module_id}-segments.is.md`)
        ),
      });
    }
    const c = cache.get(key);
    return { en: c.en[row.segment_id] || '', mtAtSnapshot: c.mt[row.segment_id] || '' };
  };

  const snapshot = {
    schema: 1,
    takenAt: new Date().toISOString(),
    book,
    mainCommit: resolveMainCommit(),
    modules,
    edits: rows.map((r) => ({ ...r, context: contextFor(r) })),
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  return { rows: rows.length, path: out };
}

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    book: get('--book'),
    modules: (get('--modules') || '').split(',').filter(Boolean),
    out: get('--out'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { book, modules, out } = parseArgs(process.argv.slice(2));
  if (!book || !modules.length || !out) {
    console.error(
      'Usage: node scripts/export-segment-edits.js --book <slug> --modules m1,m2 --out <path>'
    );
    process.exit(1);
  }
  const resolveDbPath = require(path.join(REPO_ROOT, 'server', 'lib', 'dbPath.js'));
  const res = runExport({
    book,
    modules,
    out,
    dbPath: resolveDbPath(),
    booksDir: path.join(REPO_ROOT, 'books'),
  });
  console.log(`Exported ${res.rows} segment_edits rows → ${res.path}`);
}
