/**
 * Static tripwire (batch 4, design D1): activityLog.log() is never-throw,
 * so call sites must NOT wrap it in their own try/catch — and the silent
 * empty catch whose body is only the fire-and-forget comment must never
 * return. If this test fails on new code, call activityLog.log() bare; it
 * cannot throw.
 *
 * A third pattern (fix wave, whole-branch review) bans ANY comment-less
 * empty catch block in these directories, not just the fire-and-forget
 * idiom — a silent swallow with no explanation is the same defect class
 * even if it never grew the specific comment this guard was named for.
 *
 * The scan is recursive (fix wave) so future subdirectories under routes/
 * or services/ can't silently drop out of coverage.
 *
 * Narrow by design (B1-F1 lesson: reword offending comments, never weaken
 * the guard): prose mentions of "fire-and-forget" elsewhere (tmService)
 * are fine — only the empty-catch idioms and try-wrapped audit writes trip.
 * (NB: never quote the literal catch idiom inside a block comment here —
 * its asterisk-slash would terminate the comment.)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_DIRS = [path.join(__dirname, '..', 'routes'), path.join(__dirname, '..', 'services')];

const SILENT_CATCH = /catch\s*(?:\([^)]*\)\s*)?\{\s*\/\*\s*fire-and-forget\s*\*\/\s*\}/;
const TRY_WRAPPED_AUDIT = /try\s*\{\s*activityLog\.log\(/;
// G1.2 PR3 (decision 41): researchLog.record is never-throw too, so it is called bare.
const TRY_WRAPPED_RECORD = /try\s*\{\s*researchLog\.record\(/;
const EMPTY_CATCH_NO_COMMENT = /catch\s*(?:\([^)]*\)\s*)?\{\s*\}/;

function jsFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f));
}

describe('activityLog call-site guard', () => {
  for (const dir of SCAN_DIRS) {
    for (const file of jsFiles(dir)) {
      const rel = path.relative(path.join(__dirname, '..'), file);
      const src = fs.readFileSync(file, 'utf-8');

      it(`${rel}: no silent fire-and-forget catch`, () => {
        expect(src).not.toMatch(SILENT_CATCH);
      });

      it(`${rel}: no try-wrapped activityLog.log (it is never-throw)`, () => {
        expect(src).not.toMatch(TRY_WRAPPED_AUDIT);
      });

      it(`${rel}: no try-wrapped researchLog.record (it is never-throw)`, () => {
        expect(src).not.toMatch(TRY_WRAPPED_RECORD);
      });

      it(`${rel}: no comment-less empty catch`, () => {
        expect(src).not.toMatch(EMPTY_CATCH_NO_COMMENT);
      });
    }
  }

  it('control: TRY_WRAPPED_RECORD matches a try-wrapped call and not a bare one', () => {
    expect('try {\n  researchLog.record(ev);\n} finally {\n  done();\n}').toMatch(
      TRY_WRAPPED_RECORD
    );
    expect('researchLog.record(ev);').not.toMatch(TRY_WRAPPED_RECORD);
  });
});
