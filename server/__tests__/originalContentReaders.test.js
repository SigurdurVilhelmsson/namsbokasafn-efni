/**
 * The audited readers of `segment_edits.original_content` (spec §5.8, Claude's call 10; §13;
 * PR1 plan decision 18).
 *
 * G1.1 makes a re-save move the base record: `saveSegmentEdit`'s UPDATE path (which matches only
 * a `pending` row) starts setting `original_content`, where until now it was written on insert
 * only. Every reader was checked before that change; this file pins the result, so the next new
 * reader of `original_content` (or of `SELECT *` on the table, which carries it) fails `npm test`
 * until it is audited and added below with its verdict.
 *
 * A pin, not a behaviour change: both real checks pass on the tree they were written on. The two
 * controls at the end plant readers in a temp root, so a scanner that cannot see one cannot pass.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// Each file whose text names `original_content` or `originalContent`, with the audit's verdict.
// A moved base changes only `pending` rows (the re-save UPDATE matches `status = 'pending'`).
const AUDITED_READERS = [
  // The snapshot's `original_content` is the fallback for the old MT; its comments and operator
  // warning say the UPDATE branch never writes `original_content`. Task 12 corrects them and pins
  // the new behaviour (the UPDATE branch writes the new MT).
  'scripts/reattach-segment-edits.js',
  // The snapshot's `original_content`, display only: shows the latest base. No change.
  'scripts/render-segment-edits-md.js',
  // A comment: applyApprovedEdits never compares `original_content`. No change.
  'server/lib/applyHold.js',
  // The research filter (G1.2) classifies `original_content` for research before-images and reads no
  // database; a before-image deliberately records the row's prior base, a moved one included (spec §5.8:
  // the event keeps the old). No change.
  'server/lib/researchFilter.js',
  // `localization_pending_edits`, another table. No change.
  'server/public/js/localization-editor.js',
  // `buildSaveBody` sends the row's `data-is` as `originalContent`: a request field, which the
  // server stops reading in Task 14 (decision 25). No change.
  'server/public/js/segment-save-state.js',
  // `localization_pending_edits`, another table. No change.
  'server/routes/localization-editor.js',
  // The edit route no longer reads the client's `originalContent` (Task 14): saveOnServedBase
  // stores the server's base. The token survives only in the comment saying so. No change.
  'server/routes/segment-editor.js',
  // `SELECT *`, then a frozen fingerprint compare: a moved base reads as "changed since it was
  // frozen" and the row is refused. Fail-closed, correct. No change.
  'server/scripts/close-pending-edits.js',
  // Approved rows' `original_content` for the class `clean`; Task 12 corrects the docstring
  // ("the text the editor started from" becomes the base of the last re-save).
  'server/scripts/read-apply-exposure.js',
  // `localization_pending_edits`, another table. No change.
  'server/services/localizationReviewService.js',
  // A writer: propagation's INSERT and in-place UPDATE. Task 16.
  'server/services/propagationService.js',
  // A writer: `saveOnServedBase` passes the server's base (`seg.is`) as `originalContent` to
  // `saveSegmentEdit`, never a caller's value (spec §5.6 step 6; Task 13). Reads nothing back.
  'server/services/servedEdit.js',
  // The writer (`saveSegmentEdit`, Task 12) and the rows sent to browsers through `SELECT *`
  // (the module route, segment history, reviews): the value sent changes, and no client reads
  // `original_content` from a `segment_edits` row. No change beyond Task 12.
  'server/services/segmentEditorService.js',
  // Approved rows' `original_content` as the "before" of a term substitution: for a row later
  // approved it becomes the base the final text was made on, the truer before. No change.
  'server/services/termMiningService.js',
];

// Each file that runs `SELECT * FROM segment_edits`, which carries `original_content` (and the
// G1.1 columns) to its reader.
const AUDITED_SELECT_STAR = [
  // Into the snapshot: carries the latest base and the new columns. No change.
  'scripts/export-segment-edits.js',
  // Then the frozen fingerprint compare above: fail-closed. No change.
  'server/scripts/close-pending-edits.js',
  // Pending rows, a read-only probe: shows the latest base. No change.
  'server/scripts/read-pending-edits.js',
  // The module route, segment history, reviews and the review functions. As above.
  'server/services/segmentEditorService.js',
];

const ROOTS = ['server', 'scripts', 'tools'];
const SKIP_DIR_NAMES = new Set(['node_modules', '.venv', '__tests__', 'migrations']);
const SKIP_DIR_PATHS = new Set(['server/e2e']);
const SOURCE_EXT = /\.(js|cjs|mjs)$/;
const TEST_FILE = /\.test\./;

/**
 * Every `.js`, `.cjs` and `.mjs` file under `server/`, `scripts/` and `tools/` of `root` whose text
 * matches `pattern`, as sorted repo-relative paths with `/` separators. Read with
 * `fs.readFileSync`, so a NUL byte in a file cannot hide a match (unlike `grep` without `-a`).
 */
function scanReaders(root, pattern) {
  const found = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name) || SKIP_DIR_PATHS.has(childRel)) continue;
        walk(childRel);
      } else if (entry.isFile() && SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
        if (pattern.test(fs.readFileSync(path.join(root, childRel), 'utf8'))) found.push(childRel);
      }
    }
  };
  for (const top of ROOTS) {
    if (fs.existsSync(path.join(root, top))) walk(top);
  }
  return found.sort();
}

const READS_ORIGINAL = /original_content|originalContent/;
const SELECT_STAR = /SELECT\s+\*\s+FROM\s+segment_edits/;

const notIn = (list) => (p) => !list.includes(p);

describe('the readers of segment_edits.original_content', () => {
  it('every reader of original_content is in the audit', () => {
    expect(scanReaders(REPO, READS_ORIGINAL).filter(notIn(AUDITED_READERS))).toEqual([]);
  });

  it('every SELECT * on segment_edits is in the audit', () => {
    expect(scanReaders(REPO, SELECT_STAR).filter(notIn(AUDITED_SELECT_STAR))).toEqual([]);
  });

  // Stale entries: a listed file that no longer matches its pattern (moved, renamed, or its reader removed) is an
  // audit verdict about nothing, and the next file to take that name would pass unaudited.
  it('every audited entry still matches its pattern', () => {
    const readers = scanReaders(REPO, READS_ORIGINAL);
    const selectStar = scanReaders(REPO, SELECT_STAR);
    expect(AUDITED_READERS.filter((p) => !readers.includes(p))).toEqual([]);
    expect(AUDITED_SELECT_STAR.filter((p) => !selectStar.includes(p))).toEqual([]);
  });

  it('control: a planted reader in a temp root is named', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'original-content-readers-'));
    try {
      fs.mkdirSync(path.join(root, 'server', 'services'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'server', 'services', 'x.js'),
        'module.exports = (row) => row.original_content;\n'
      );
      expect(scanReaders(root, READS_ORIGINAL).filter(notIn(AUDITED_READERS))).toEqual([
        'server/services/x.js',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('control: the walk skips only what it should, and a NUL byte hides nothing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'original-content-readers-'));
    const plant = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    try {
      const reader = 'module.exports = (row) => row.original_content;\n';
      for (const skipped of [
        'server/node_modules/a.js',
        'server/greynir-sidecar/.venv/b.js',
        'server/__tests__/c.js',
        'server/migrations/d.js',
        'server/e2e/e.js',
        'server/services/f.test.js',
        'server/views/g.html',
        'docs/h.js',
      ]) {
        plant(skipped, reader);
      }
      plant('scripts/i.mjs', `// a\u0000b\n${reader}`);
      plant('tools/lib/j.cjs', 'exports.k = (e) => e.originalContent;\n');
      plant('tools/e2e/l.js', reader);
      expect(scanReaders(root, READS_ORIGINAL)).toEqual([
        'scripts/i.mjs',
        'tools/e2e/l.js',
        'tools/lib/j.cjs',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
