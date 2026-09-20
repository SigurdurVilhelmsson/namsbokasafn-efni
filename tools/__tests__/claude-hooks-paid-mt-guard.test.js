import { describe, it, expect } from 'vitest';
import { inspect } from '../../.claude/hooks/guard-paid-mt.mjs';

/**
 * Pin for the PreToolUse guard that forces a confirmation before a PAID
 * Málstaður run (.claude/hooks/guard-paid-mt.mjs).
 *
 * Why the hook exists at all — MEASURED 2026-09-20: a `permissions.ask` entry
 * for `Bash(node tools/api-translate.js:*)` does NOT prompt in this repo,
 * because `.claude/settings.local.json` allowlists the broad `Bash(node:*)`
 * and that allow outranks the ask. A `deny` on the identical command in the
 * identical file DID block, so the file is read and the syntax is right; `ask`
 * simply loses. A PreToolUse hook returning `permissionDecision: "ask"` does
 * not lose, which is why the guard is a hook rather than a rule.
 *
 * ⚠ THE FREE CASES ARE THE LOAD-BEARING HALF. `--dry-run` is how anyone sizes
 * a buy before making it, and `--help` is how they check a flag. A guard that
 * prompts on those gets switched off, and then nothing guards the paid path.
 *
 * Staleness reporting is deliberately NOT asserted here: it reads mtimes off
 * the working tree, so any expectation would pass or fail on when the checkout
 * happened rather than on the code. It was measured against the real corpus
 * instead — a recently re-extracted chapter read 0 of N, and a chapter that
 * had not been re-extracted since the extractor changed read N of N. No
 * chapter number is recorded here on purpose: one of the chapters used in
 * that measurement was re-extracted eleven minutes later and flipped from
 * stale to fresh, which is exactly how a comment becomes a false premise.
 */

describe('paid-MT guard — commands that must NOT prompt', () => {
  it('stays silent on --dry-run, the way a buy is sized', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --dry-run')).toBeNull();
  });

  it('stays silent on the -n short form', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e -n')).toBeNull();
  });

  it('stays silent on --help', () => {
    expect(inspect('node tools/api-translate.js --help')).toBeNull();
  });

  it('stays out of the way of the free extractor', () => {
    expect(inspect('node tools/cnxml-extract.js --book efnafraedi-2e --chapter 1')).toBeNull();
  });

  it('stays out of the way of unrelated commands', () => {
    expect(inspect('git status --porcelain')).toBeNull();
  });
});

describe('paid-MT guard — commands that must prompt', () => {
  it('prompts on a real chapter buy', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toBeTruthy();
  });

  it('says plainly that money is involved', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toMatch(
      /spends money/
    );
  });

  it('prompts on the chapter-titles tool, which is also paid', () => {
    expect(inspect('node tools/translate-chapter-titles.js efnafraedi-2e')).toBeTruthy();
  });

  it('calls out --force, which overwrites committed MT', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7 --force')).toMatch(
      /--force/
    );
  });

  it('names the scope it judged, so the warning is checkable', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toMatch(
      /02-for-mt\/ch07/
    );
  });
});
